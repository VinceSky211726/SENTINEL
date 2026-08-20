"""Enrichissement LLM — prompt section 2.3, Gemini Flash, fallback Groq."""

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

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
HTTP_TIMEOUT = 90.0
MAX_BATCH = int(os.getenv("LLM_MAX_ITEMS", "3"))

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
HorizonFr = Literal["immediat", "court_terme", "structurel"]

TYPE_TO_KEY: dict[str, EventTypeKey] = {
    "resultats": "res",
    "guidance": "guid",
    "m&a": "ma",
    "reglementaire": "reg",
    "juridique": "jur",
    "produit": "prod",
    "direction": "mgmt",
    "notation": "rating",
    "macro": "macro",
    "rumeur": "rumor",
    "bruit": "rumor",
}

TYPE_LABELS: dict[EventTypeKey, str] = {
    "reg": "Réglementaire",
    "guid": "Guidance",
    "prod": "Produit",
    "jur": "Juridique",
    "res": "Résultats",
    "ma": "M&A",
    "mgmt": "Direction",
    "rating": "Notation",
    "macro": "Macro",
    "rumor": "Rumeur",
}

HORIZON_TO_DB: dict[str, HorizonKey] = {
    "immediat": "immediate",
    "court_terme": "short_term",
    "structurel": "structural",
}

# Prompt section 2.3 — texte exact
SECTION_2_3_PROMPT = """Tu es analyste financier. On te donne des clusters d'actualités concernant
des entreprises d'un portefeuille. Pour CHAQUE cluster, produis un objet JSON.

Portefeuille de l'utilisateur (avec pondération) :
{portfolio_json}

Clusters à analyser :
{clusters_json}

Réponds UNIQUEMENT avec un tableau JSON, sans texte avant ou après,
sans balises markdown. Schéma par élément :

{{
  "cluster_id": string,
  "ticker_principal": string,
  "type_evenement": one of ["resultats","guidance","M&A","reglementaire",
      "juridique","produit","direction","notation","macro","rumeur","bruit"],
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
- "impact_score" mesure l'effet attendu sur la valorisation, PAS l'intérêt
  journalistique. Un article "5 raisons d'acheter X" = type "bruit", score 0.
- Ne jamais inventer de chiffre absent des sources.
- Si tu ne peux pas déterminer un champ, mets null plutôt que de deviner."""


class ClusterAnalysis(BaseModel):
    cluster_id: str
    ticker_principal: str
    type_evenement: Optional[TypeEvenement] = None
    sentiment: Optional[float] = Field(default=None, ge=-1.0, le=1.0)
    impact_score: Optional[int] = Field(default=None, ge=0, le=100)
    horizon: Optional[HorizonFr] = None
    confiance: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    resume: Optional[str] = None
    contagion: Optional[list[str]] = None
    justification_score: Optional[str] = None

    @field_validator("contagion", mode="before")
    @classmethod
    def normalize_contagion(cls, value: Any) -> Optional[list[str]]:
        if value is None:
            return None
        if isinstance(value, list):
            return [str(v).strip().upper() for v in value if v]
        return None


class PortfolioRow(BaseModel):
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
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


def load_portfolio(client: Client) -> dict[str, PortfolioRow]:
    rows = (
        client.table("portfolio")
        .select("symbol, name, weight_pct, position_side, alert_threshold")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    return {
        r["symbol"]: PortfolioRow(
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
        .select(
            "id, symbol, raw_title, raw_body, raw_url, sources, published_at"
        )
        .eq("filter_passed", True)
        .eq("llm_processed", False)
        .order("detected_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [PendingEvent.model_validate(r) for r in rows]


def portfolio_to_json(portfolio: dict[str, PortfolioRow]) -> str:
    payload = [
        {
            "symbol": p.symbol,
            "name": p.name,
            "weight_pct": p.weight_pct,
            "position_side": p.position_side,
            "alert_threshold": p.alert_threshold,
        }
        for p in portfolio.values()
    ]
    return json.dumps(payload, ensure_ascii=False, indent=2)


def event_to_cluster(event: PendingEvent) -> dict[str, Any]:
    return {
        "cluster_id": event.id,
        "ticker": event.symbol,
        "titre": event.raw_title,
        "corps": (event.raw_body or "")[:1500],
        "url": event.raw_url,
        "sources": event.sources,
        "published_at": event.published_at,
    }


def build_prompt(
    portfolio: dict[str, PortfolioRow],
    events: list[PendingEvent],
) -> str:
    clusters = [event_to_cluster(e) for e in events]
    return SECTION_2_3_PROMPT.format(
        portfolio_json=portfolio_to_json(portfolio),
        clusters_json=json.dumps(clusters, ensure_ascii=False, indent=2),
    )


def extract_json_array(text: str) -> list[Any]:
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start == -1 or end == -1:
            raise LlmError("Tableau JSON introuvable dans la réponse LLM") from None
        parsed = json.loads(cleaned[start : end + 1])
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("clusters", "results", "items", "data"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
    raise LlmError("Réponse LLM : tableau JSON attendu")


def _http_llm_error(provider: str, resp: httpx.Response) -> LlmError:
    detail = resp.text[:300]
    return LlmError(
        f"{provider} HTTP {resp.status_code}: {detail}",
        status_code=resp.status_code,
    )


def call_gemini(api_key: str, prompt: str) -> str:
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(
            GEMINI_URL,
            params={"key": api_key},
            headers=headers,
            json=payload,
        )
        if resp.status_code >= 400:
            raise _http_llm_error("Gemini", resp)
        data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError(f"Réponse Gemini invalide: {data}") from exc


def call_groq(api_key: str, prompt: str) -> str:
    payload = {
        "model": GROQ_MODEL,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": "Réponds uniquement avec un tableau JSON valide, sans markdown.",
            },
            {"role": "user", "content": prompt},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(GROQ_URL, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise _http_llm_error("Groq", resp)
        data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError(f"Réponse Groq invalide: {data}") from exc


def analyze_batch(
    prompt: str,
    gemini_key: str,
    groq_key: str,
) -> tuple[list[ClusterAnalysis], str, bool]:
    raw: Optional[str] = None
    model = GEMINI_MODEL
    fallback = False

    if gemini_key:
        try:
            raw = call_gemini(gemini_key, prompt)
        except LlmError as exc:
            if groq_key:
                log.warning("Gemini indisponible (%s) — bascule Groq", exc)
                raw = call_groq(groq_key, prompt)
                model = GROQ_MODEL
                fallback = True
            else:
                raise
    elif groq_key:
        raw = call_groq(groq_key, prompt)
        model = GROQ_MODEL
        fallback = True
    else:
        raise LlmError("Aucune clé LLM configurée")

    items = extract_json_array(raw)
    parsed: list[ClusterAnalysis] = []
    for item in items:
        parsed.append(ClusterAnalysis.model_validate(item))
    return parsed, model, fallback


def map_type_evenement(value: Optional[str]) -> EventTypeKey:
    if not value:
        return "rumor"
    return TYPE_TO_KEY.get(value.lower().replace(" ", ""), "rumor")


def pick_contagion(
    contagion: Optional[list[str]],
    portfolio: dict[str, PortfolioRow],
    exclude: str,
) -> Optional[str]:
    if not contagion:
        return None
    for ticker in contagion:
        t = ticker.strip().upper()
        if t in portfolio and t != exclude.upper():
            return t
    return None


def degraded_row(event: PendingEvent, llm_model: str) -> dict[str, Any]:
    title = (event.raw_title or "Information sans titre")[:200]
    body = (event.raw_body or title)[:2000]
    now = datetime.now(timezone.utc).isoformat()
    return {
        "event_type": "Rumeur",
        "event_type_key": "rumor",
        "title": title,
        "summary": body[:280],
        "body": body,
        "scoring_rationale": (
            "Analyse LLM indisponible — mode dégradé, vérification manuelle recommandée."
        ),
        "impact_score": 25,
        "sentiment": 0.0,
        "confidence_pct": 20,
        "horizon": "short_term",
        "contagion_symbol": None,
        "llm_processed": True,
        "llm_model": llm_model,
        "llm_processed_at": now,
        "llm_fallback_used": True,
        "updated_at": now,
    }


def analysis_to_row(
    analysis: ClusterAnalysis,
    event: PendingEvent,
    portfolio: dict[str, PortfolioRow],
    *,
    llm_model: str,
    llm_fallback_used: bool,
) -> dict[str, Any]:
    type_key = map_type_evenement(analysis.type_evenement)
    impact = analysis.impact_score if analysis.impact_score is not None else 25
    if analysis.type_evenement == "bruit":
        impact = min(impact, 10)

    resume = analysis.resume or (event.raw_body or event.raw_title or "")[:500]
    title = (event.raw_title or resume.split(".")[0])[:200]
    horizon_db = (
        HORIZON_TO_DB.get(analysis.horizon, "short_term")
        if analysis.horizon
        else "short_term"
    )
    confiance_pct = (
        int(round(analysis.confiance * 100)) if analysis.confiance is not None else 20
    )
    now = datetime.now(timezone.utc).isoformat()

    return {
        "event_type": TYPE_LABELS.get(type_key, type_key),
        "event_type_key": type_key,
        "title": title,
        "summary": resume[:500],
        "body": resume,
        "scoring_rationale": analysis.justification_score
        or "Justification non fournie par le modèle.",
        "impact_score": impact,
        "sentiment": analysis.sentiment if analysis.sentiment is not None else 0.0,
        "confidence_pct": confiance_pct,
        "horizon": horizon_db,
        "contagion_symbol": pick_contagion(
            analysis.contagion, portfolio, event.symbol
        ),
        "llm_processed": True,
        "llm_model": llm_model,
        "llm_processed_at": now,
        "llm_fallback_used": llm_fallback_used,
        "updated_at": now,
    }


def persist_update(client: Client, event_id: str, row: dict[str, Any]) -> None:
    client.table("events").update(row).eq("id", event_id).execute()


def process_batch(
    events: list[PendingEvent],
    portfolio: dict[str, PortfolioRow],
    gemini_key: str,
    groq_key: str,
) -> dict[str, int]:
    stats = {"ok": 0, "fallback": 0, "degraded": 0}
    client = get_supabase()
    prompt = build_prompt(portfolio, events)

    try:
        analyses, model, fallback = analyze_batch(prompt, gemini_key, groq_key)
        by_id = {a.cluster_id: a for a in analyses}
        for event in events:
            analysis = by_id.get(event.id)
            if not analysis:
                log.warning("Cluster %s absent de la réponse LLM — dégradé", event.id[:8])
                row = degraded_row(event, "degraded-missing")
                stats["degraded"] += 1
            else:
                row = analysis_to_row(
                    analysis, event, portfolio,
                    llm_model=model, llm_fallback_used=fallback,
                )
                if fallback:
                    stats["fallback"] += 1
                else:
                    stats["ok"] += 1
            persist_update(client, event.id, row)
            log.info(
                "Event %s · %s · impact=%s · %s",
                event.id[:8],
                row.get("event_type_key"),
                row.get("impact_score"),
                row.get("llm_model"),
            )
    except LlmError as exc:
        log.warning("Batch LLM échoué (%s) — mode dégradé pour %d items", exc, len(events))
        for event in events:
            persist_update(client, event.id, degraded_row(event, "degraded"))
            stats["degraded"] += 1

    return stats


def run() -> None:
    client = get_supabase()
    portfolio = load_portfolio(client)
    events = load_pending_events(client, MAX_BATCH)

    if not events:
        log.info("Aucun event en attente d'enrichissement LLM.")
        return

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key = os.getenv("GROQ_API_KEY", "")

    if not gemini_key and not groq_key:
        log.warning("GEMINI_API_KEY et GROQ_API_KEY absents — mode dégradé.")

    stats = process_batch(events, portfolio, gemini_key, groq_key)
    log.info(
        "LLM terminé : %d traités (%d ok, %d fallback, %d dégradé)",
        len(events),
        stats["ok"],
        stats["fallback"],
        stats["degraded"],
    )


def main() -> None:
    run()


if __name__ == "__main__":
    main()
