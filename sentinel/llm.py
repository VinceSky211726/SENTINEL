"""Enrichissement LLM — Gemini Flash, fallback Groq, mode dégradé."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Literal, Optional

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError, field_validator
from supabase import Client, create_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
HTTP_TIMEOUT = 60.0
MAX_ITEMS = int(os.getenv("LLM_MAX_ITEMS", "8"))

EventTypeKey = Literal[
    "reg", "guid", "prod", "jur", "res", "ma", "mgmt", "rating", "macro", "rumor"
]
HorizonKey = Literal["immediate", "short_term", "structural"]
TypeEvenement = Literal[
    "resultats",
    "guidance",
    "M&A",
    "reglementaire",
    "juridique",
    "produit",
    "direction",
    "notation",
    "macro",
    "rumeur",
    "bruit",
]
HorizonLlm = Literal["immediat", "court_terme", "structurel"]

# Prompt section 2.3 — analyse par clusters (batch)
ANALYSIS_PROMPT_TEMPLATE = """Tu es analyste financier. On te donne des clusters d'actualités concernant des entreprises d'un portefeuille. Pour CHAQUE cluster, produis un objet JSON.

Portefeuille de l'utilisateur (avec pondération) :
{portfolio_json}

Clusters à analyser :
{clusters_json}

Réponds UNIQUEMENT avec un tableau JSON, sans texte avant ou après, sans balises markdown. Schéma par élément :

{{
  "cluster_id": string,
  "ticker_principal": string,
  "type_evenement": one of ["resultats","guidance","M&A","reglementaire","juridique","produit","direction","notation","macro","rumeur","bruit"],
  "sentiment": float entre -1.0 et 1.0,
  "impact_score": int 0-100,
  "horizon": one of ["immediat","court_terme","structurel"],
  "confiance": float 0.0-1.0,
  "resume": string,
  "contagion": [string],
  "justification_score": string
}}

Règles impératives :
- Si l'information est déjà publique depuis plus de 48h, impact_score <= 20.
- Si la source unique est un blog ou un forum, confiance <= 0.4.
- "impact_score" mesure l'effet attendu sur la valorisation, PAS l'intérêt journalistique. Un article "5 raisons d'acheter X" = type "bruit", score 0.
- Ne jamais inventer de chiffre absent des sources.
- Si tu ne peux pas déterminer un champ, mets null plutôt que de deviner."""

TYPE_EVENEMENT_TO_KEY: dict[str, EventTypeKey] = {
    "resultats": "res",
    "guidance": "guid",
    "M&A": "ma",
    "reglementaire": "reg",
    "juridique": "jur",
    "produit": "prod",
    "direction": "mgmt",
    "notation": "rating",
    "macro": "macro",
    "rumeur": "rumor",
    "bruit": "rumor",
}

TYPE_EVENEMENT_LABELS: dict[str, str] = {
    "resultats": "Résultats",
    "guidance": "Guidance",
    "M&A": "M&A",
    "reglementaire": "Réglementaire",
    "juridique": "Juridique",
    "produit": "Produit",
    "direction": "Direction",
    "notation": "Notation",
    "macro": "Macro",
    "rumeur": "Rumeur",
    "bruit": "Bruit",
}

HORIZON_MAP: dict[str, HorizonKey] = {
    "immediat": "immediate",
    "court_terme": "short_term",
    "structurel": "structural",
}


class ClusterInput(BaseModel):
    cluster_id: str
    ticker_principal: str
    raw_title: Optional[str] = None
    raw_body: Optional[str] = None
    raw_url: Optional[str] = None
    sources: list[dict[str, Any]] = Field(default_factory=list)
    published_at: Optional[str] = None


class ClusterAnalysisOutput(BaseModel):
    cluster_id: str
    ticker_principal: str
    type_evenement: Optional[TypeEvenement] = None
    sentiment: Optional[float] = Field(default=None, ge=-1.0, le=1.0)
    impact_score: Optional[int] = Field(default=None, ge=0, le=100)
    horizon: Optional[HorizonLlm] = None
    confiance: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    resume: Optional[str] = None
    contagion: list[str] = Field(default_factory=list)
    justification_score: Optional[str] = None

    @field_validator("contagion", mode="before")
    @classmethod
    def normalize_contagion(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v).strip().upper() for v in value if v]
        return []


class PortfolioContext(BaseModel):
    symbol: str
    name: str
    weight_pct: float
    position_side: str = "long"
    alert_threshold: int = 60


class PendingEvent(BaseModel):
    id: str
    symbol: str
    raw_title: Optional[str] = None
    raw_body: Optional[str] = None
    raw_url: Optional[str] = None
    sources: list[dict[str, Any]] = Field(default_factory=list)
    published_at: Optional[str] = None


class LlmError(Exception):
    """Erreur appel LLM."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


def load_portfolio(client: Client) -> dict[str, PortfolioContext]:
    rows = (
        client.table("portfolio")
        .select("symbol, name, weight_pct, position_side, alert_threshold")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    return {
        r["symbol"]: PortfolioContext(
            symbol=r["symbol"],
            name=r["name"],
            weight_pct=float(r["weight_pct"]),
            position_side=r.get("position_side") or "long",
            alert_threshold=int(r.get("alert_threshold") or 60),
        )
        for r in rows
    }


def load_pending_events(client: Client, limit: int) -> list[PendingEvent]:
    rows = (
        client.table("events")
        .select("id, symbol, raw_title, raw_body, raw_url, sources, published_at")
        .eq("filter_passed", True)
        .eq("llm_processed", False)
        .order("detected_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [PendingEvent.model_validate(r) for r in rows]


def event_to_cluster(event: PendingEvent) -> ClusterInput:
    return ClusterInput(
        cluster_id=event.id,
        ticker_principal=event.symbol,
        raw_title=event.raw_title,
        raw_body=(event.raw_body or "")[:4000] or None,
        raw_url=event.raw_url,
        sources=event.sources,
        published_at=event.published_at,
    )


def portfolio_to_json(portfolio: dict[str, PortfolioContext]) -> str:
    entries = [
        {
            "symbol": ctx.symbol,
            "name": ctx.name,
            "weight_pct": ctx.weight_pct,
            "position_side": ctx.position_side,
            "alert_threshold": ctx.alert_threshold,
        }
        for ctx in sorted(portfolio.values(), key=lambda p: p.symbol)
    ]
    return json.dumps(entries, ensure_ascii=False, indent=2)


def build_analysis_prompt(
    clusters: list[ClusterInput],
    portfolio: dict[str, PortfolioContext],
) -> str:
    clusters_payload = [
        c.model_dump(exclude_none=True) for c in clusters
    ]
    return ANALYSIS_PROMPT_TEMPLATE.format(
        portfolio_json=portfolio_to_json(portfolio),
        clusters_json=json.dumps(clusters_payload, ensure_ascii=False, indent=2),
    )


def extract_json_array(text: str) -> list[dict[str, Any]]:
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1:
        raise LlmError("Tableau JSON introuvable dans la réponse LLM")
    return json.loads(cleaned[start : end + 1])


def call_gemini(api_key: str, user_prompt: str) -> str:
    payload = {
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(GEMINI_URL, params={"key": api_key}, json=payload)
        if resp.status_code == 429:
            raise LlmError("Gemini quota exceeded (429)", status_code=429)
        resp.raise_for_status()
        data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError(f"Réponse Gemini invalide: {data}") from exc


def call_groq(api_key: str, user_prompt: str) -> str:
    payload = {
        "model": GROQ_MODEL,
        "temperature": 0.2,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(GROQ_URL, headers=headers, json=payload)
        if resp.status_code == 429:
            raise LlmError("Groq quota exceeded (429)", status_code=429)
        resp.raise_for_status()
        data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError(f"Réponse Groq invalide: {data}") from exc


def analyze_batch_with_llm(
    user_prompt: str,
    gemini_key: str,
    groq_key: str,
) -> tuple[list[ClusterAnalysisOutput], str, bool]:
    """Retourne (outputs, model_name, fallback_used)."""
    raw: Optional[str] = None
    model = GEMINI_MODEL
    fallback = False

    if gemini_key:
        try:
            raw = call_gemini(gemini_key, user_prompt)
        except LlmError as exc:
            if exc.status_code == 429 and groq_key:
                log.warning("Gemini 429 — bascule Groq")
                raw = call_groq(groq_key, user_prompt)
                model = GROQ_MODEL
                fallback = True
            else:
                raise
    elif groq_key:
        raw = call_groq(groq_key, user_prompt)
        model = GROQ_MODEL
        fallback = True
    else:
        raise LlmError("Aucune clé LLM configurée")

    try:
        items = extract_json_array(raw)
        outputs = [ClusterAnalysisOutput.model_validate(item) for item in items]
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise LlmError(f"JSON LLM invalide: {exc}") from exc

    return outputs, model, fallback


def first_sentence(text: str) -> str:
    text = text.strip()
    if not text:
        return ""
    match = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    return match[0]


def pick_contagion_symbol(
    contagion: list[str],
    portfolio: dict[str, PortfolioContext],
) -> Optional[str]:
    for ticker in contagion:
        symbol = ticker.strip().upper()
        if symbol in portfolio:
            return symbol
    return None


def map_analysis_to_update(
    event: PendingEvent,
    analysis: ClusterAnalysisOutput,
    portfolio: dict[str, PortfolioContext],
    *,
    llm_model: str,
    llm_fallback_used: bool,
) -> dict[str, Any]:
    type_ev = analysis.type_evenement or "rumeur"
    event_type_key = TYPE_EVENEMENT_TO_KEY.get(type_ev, "rumor")
    event_type = TYPE_EVENEMENT_LABELS.get(type_ev, "Rumeur")

    impact_score = analysis.impact_score if analysis.impact_score is not None else 25
    if type_ev == "bruit":
        impact_score = min(impact_score, 5)

    sentiment = analysis.sentiment if analysis.sentiment is not None else 0.0
    confidence_pct = int(round((analysis.confiance if analysis.confiance is not None else 0.2) * 100))
    horizon = HORIZON_MAP.get(analysis.horizon or "court_terme", "short_term")

    resume = analysis.resume or (event.raw_body or event.raw_title or "Contenu indisponible.")
    title = (event.raw_title or first_sentence(resume) or "Information sans titre")[:200]

    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": event.id,
        "event_type": event_type,
        "event_type_key": event_type_key,
        "title": title,
        "summary": resume,
        "body": resume,
        "scoring_rationale": analysis.justification_score
        or "Analyse automatique sans justification détaillée.",
        "impact_score": impact_score,
        "sentiment": sentiment,
        "confidence_pct": confidence_pct,
        "horizon": horizon,
        "contagion_symbol": pick_contagion_symbol(analysis.contagion, portfolio),
        "llm_processed": True,
        "llm_model": llm_model,
        "llm_processed_at": now,
        "llm_fallback_used": llm_fallback_used,
        "updated_at": now,
    }


def degraded_update_row(event: PendingEvent) -> dict[str, Any]:
    title = (event.raw_title or "Information sans titre")[:200]
    body = (event.raw_body or event.raw_title or "Contenu indisponible.")[:2000]
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": event.id,
        "event_type": "Rumeur",
        "event_type_key": "rumor",
        "title": title,
        "summary": body[:280] if len(body) > 280 else body,
        "body": body,
        "scoring_rationale": (
            "Analyse LLM indisponible (Gemini et Groq en échec). "
            "Score conservateur appliqué — vérification manuelle recommandée."
        ),
        "impact_score": 25,
        "sentiment": 0.0,
        "confidence_pct": 20,
        "horizon": "short_term",
        "contagion_symbol": None,
        "llm_processed": True,
        "llm_model": "degraded",
        "llm_processed_at": now,
        "llm_fallback_used": True,
        "updated_at": now,
    }


def persist_update(client: Client, row: dict[str, Any]) -> None:
    event_id = row.pop("id")
    client.table("events").update(row).eq("id", event_id).execute()


def process_batch(
    events: list[PendingEvent],
    portfolio: dict[str, PortfolioContext],
    gemini_key: str,
    groq_key: str,
) -> list[dict[str, Any]]:
    if not gemini_key and not groq_key:
        log.warning("GEMINI_API_KEY et GROQ_API_KEY absents — mode dégradé pour le batch.")
        return [degraded_update_row(e) for e in events]

    clusters = [event_to_cluster(e) for e in events]
    prompt = build_analysis_prompt(clusters, portfolio)

    try:
        analyses, model, fallback = analyze_batch_with_llm(prompt, gemini_key, groq_key)
    except LlmError as exc:
        log.warning("LLM batch échec (%s) — mode dégradé pour %d events", exc, len(events))
        return [degraded_update_row(e) for e in events]

    by_id = {a.cluster_id: a for a in analyses}
    rows: list[dict[str, Any]] = []

    for event in events:
        analysis = by_id.get(event.id)
        if not analysis:
            log.warning("Event %s absent de la réponse LLM — mode dégradé", event.id[:8])
            rows.append(degraded_update_row(event))
            continue
        rows.append(
            map_analysis_to_update(
                event,
                analysis,
                portfolio,
                llm_model=model,
                llm_fallback_used=fallback,
            )
        )

    return rows


def run() -> None:
    client = get_supabase()
    portfolio = load_portfolio(client)
    events = load_pending_events(client, MAX_ITEMS)

    if not events:
        log.info("Aucun event en attente d'enrichissement LLM.")
        return

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key = os.getenv("GROQ_API_KEY", "")

    if not gemini_key and not groq_key:
        log.warning("GEMINI_API_KEY et GROQ_API_KEY absents — mode dégradé pour tous les items.")
    elif not gemini_key:
        log.warning("GEMINI_API_KEY absent — Groq seul.")

    stats = {"ok": 0, "degraded": 0, "fallback": 0}

    rows = process_batch(events, portfolio, gemini_key, groq_key)
    for event, row in zip(events, rows):
        persist_update(client, row)
        if row.get("llm_model") == "degraded":
            stats["degraded"] += 1
        elif row.get("llm_fallback_used"):
            stats["fallback"] += 1
        else:
            stats["ok"] += 1
        log.info(
            "Event %s · %s · impact=%s · %s",
            event.id[:8],
            row.get("event_type_key"),
            row.get("impact_score"),
            row.get("llm_model"),
        )

    log.info(
        "LLM terminé : %d traités (%d ok, %d fallback Groq, %d dégradé)",
        len(events),
        stats["ok"],
        stats["fallback"],
        stats["degraded"],
    )


def main() -> None:
    run()


if __name__ == "__main__":
    main()
