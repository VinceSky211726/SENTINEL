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
MAX_ITEMS = int(os.getenv("LLM_MAX_ITEMS", "20"))

EventTypeKey = Literal[
    "reg", "guid", "prod", "jur", "res", "ma", "mgmt", "rating", "macro", "rumor"
]
HorizonKey = Literal["immediate", "short_term", "structural"]

EVENT_TYPE_LABELS: dict[str, str] = {
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

# Prompt section 2.3 — analyse d'un item déjà filtré
SYSTEM_PROMPT = """Tu es Sentinel, analyste de veille financière personnelle.
Tu reçois UN article déjà filtré par heuristiques. Ne jamais inventer de faits absents du texte.

Règles d'analyse :
- impact_score (0-100) : ampleur ATTENDUE sur la valorisation du titre, pas l'intérêt médiatique.
  Un « top 10 actions » score ~0. Une divergence résultats/guidance sur ligne volatile peut scorer haut.
- sentiment (-1.0 à +1.0) : tonalité de l'information elle-même, indépendante de l'impact.
- confidence_pct (0-100) : confiance dans TA propre analyse (pas confiance dans le titre).
  Source unique type blog/forum → plafond 40 %.
- event_type_key : reg|guid|prod|jur|res|ma|mgmt|rating|macro|rumor
- horizon : immediate | short_term | structural
- contagion_symbol : ticker d'une autre ligne du portefeuille impactée indirectement, ou null
- title : titre factuel concis en français
- summary : 1-2 phrases pour le fil d'alertes
- body : paraphrase factuelle complète
- scoring_rationale : pourquoi ce impact_score (2-3 phrases)

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans commentaire."""

USER_PROMPT_TEMPLATE = """Contexte portefeuille :
- ticker : {symbol}
- nom : {name}
- poids : {weight_pct} %
- position : {position_side}
- seuil d'alerte impact : {alert_threshold}

Article source :
- titre brut : {raw_title}
- corps brut : {raw_body}
- url : {raw_url}
- sources : {sources_json}

Schéma JSON attendu :
{{
  "event_type_key": "reg|guid|prod|jur|res|ma|mgmt|rating|macro|rumor",
  "title": "string",
  "summary": "string",
  "body": "string",
  "scoring_rationale": "string",
  "impact_score": 0,
  "sentiment": 0.0,
  "confidence_pct": 0,
  "horizon": "immediate|short_term|structural",
  "contagion_symbol": null
}}"""


class LlmOutput(BaseModel):
    event_type_key: EventTypeKey
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    body: str = Field(min_length=1)
    scoring_rationale: str = Field(min_length=1)
    impact_score: int = Field(ge=0, le=100)
    sentiment: float = Field(ge=-1.0, le=1.0)
    confidence_pct: int = Field(ge=0, le=100)
    horizon: HorizonKey
    contagion_symbol: Optional[str] = None

    @field_validator("contagion_symbol", mode="before")
    @classmethod
    def empty_contagion(cls, value: Any) -> Optional[str]:
        if value in (None, "", "—", "-", "null"):
            return None
        return str(value).strip().upper()


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
        .select("id, symbol, raw_title, raw_body, raw_url, sources")
        .eq("filter_passed", True)
        .eq("llm_processed", False)
        .order("detected_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [PendingEvent.model_validate(r) for r in rows]


def build_user_prompt(event: PendingEvent, portfolio: PortfolioContext) -> str:
    return USER_PROMPT_TEMPLATE.format(
        symbol=event.symbol,
        name=portfolio.name,
        weight_pct=portfolio.weight_pct,
        position_side=portfolio.position_side,
        alert_threshold=portfolio.alert_threshold,
        raw_title=event.raw_title or "",
        raw_body=(event.raw_body or "")[:4000],
        raw_url=event.raw_url or "",
        sources_json=json.dumps(event.sources, ensure_ascii=False),
    )


def extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence:
        cleaned = fence.group(1).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise LlmError("JSON introuvable dans la réponse LLM")
    return json.loads(cleaned[start : end + 1])


def call_gemini(api_key: str, user_prompt: str) -> str:
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
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
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
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


def analyze_with_llm(
    user_prompt: str,
    gemini_key: str,
    groq_key: str,
) -> tuple[LlmOutput, str, bool]:
    """Retourne (output, model_name, fallback_used)."""
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
        parsed = LlmOutput.model_validate(extract_json(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise LlmError(f"JSON LLM invalide: {exc}") from exc

    return parsed, model, fallback


def degraded_output(event: PendingEvent) -> LlmOutput:
    title = (event.raw_title or "Information sans titre")[:200]
    body = (event.raw_body or event.raw_title or "Contenu indisponible.")[:2000]
    return LlmOutput(
        event_type_key="rumor",
        title=title,
        summary=body[:280] if len(body) > 280 else body,
        body=body,
        scoring_rationale=(
            "Analyse LLM indisponible (Gemini et Groq en échec). "
            "Score conservateur appliqué — vérification manuelle recommandée."
        ),
        impact_score=25,
        sentiment=0.0,
        confidence_pct=20,
        horizon="short_term",
        contagion_symbol=None,
    )


def to_update_row(
    event_id: str,
    output: LlmOutput,
    *,
    llm_model: str,
    llm_fallback_used: bool,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": event_id,
        "event_type": EVENT_TYPE_LABELS.get(output.event_type_key, output.event_type_key),
        "event_type_key": output.event_type_key,
        "title": output.title,
        "summary": output.summary,
        "body": output.body,
        "scoring_rationale": output.scoring_rationale,
        "impact_score": output.impact_score,
        "sentiment": output.sentiment,
        "confidence_pct": output.confidence_pct,
        "horizon": output.horizon,
        "contagion_symbol": output.contagion_symbol,
        "llm_processed": True,
        "llm_model": llm_model,
        "llm_processed_at": now,
        "llm_fallback_used": llm_fallback_used,
        "updated_at": now,
    }


def persist_update(client: Client, row: dict[str, Any]) -> None:
    event_id = row.pop("id")
    client.table("events").update(row).eq("id", event_id).execute()


def process_event(
    event: PendingEvent,
    portfolio: dict[str, PortfolioContext],
    gemini_key: str,
    groq_key: str,
) -> dict[str, Any]:
    ctx = portfolio.get(event.symbol)
    if not ctx:
        log.warning("Event %s : symbol %s hors portefeuille — skip", event.id, event.symbol)
        output = degraded_output(event)
        return to_update_row(
            event.id, output, llm_model="degraded-no-portfolio", llm_fallback_used=True
        )

    user_prompt = build_user_prompt(event, ctx)

    try:
        output, model, fallback = analyze_with_llm(user_prompt, gemini_key, groq_key)
        return to_update_row(event.id, output, llm_model=model, llm_fallback_used=fallback)
    except LlmError as exc:
        log.warning("LLM échec pour %s (%s) — mode dégradé", event.id, exc)
        output = degraded_output(event)
        return to_update_row(event.id, output, llm_model="degraded", llm_fallback_used=True)


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

    for event in events:
        row = process_event(event, portfolio, gemini_key, groq_key)
        persist_update(client, row)
        if row.get("llm_model") == "degraded" or row.get("llm_model") == "degraded-no-portfolio":
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
