"""Notifications Telegram pour les alertes enrichies."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from pydantic import BaseModel, Field
from supabase import Client

from sentinel.config import get_supabase

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
MAX_NOTIFY = int(os.getenv("NOTIFY_MAX_ITEMS", "10"))
MIN_IMPACT = int(os.getenv("NOTIFY_MIN_IMPACT", "5"))
# Telegram MarkdownV2 — tous les caractères réservés hors inline code
MDV2_ESCAPE = re.compile(r"([_*\[\]()~`>#+\-=|{}.!\\])")


class AlertEvent(BaseModel):
    id: str
    symbol: str
    event_type: Optional[str] = None
    impact_score: Optional[int] = None
    summary: Optional[str] = None
    title: Optional[str] = None
    sentiment: Optional[float] = None
    confidence_pct: Optional[int] = None
    sources: list[dict[str, Any]] = Field(default_factory=list)


def get_telegram_config() -> tuple[str, str]:
    token = os.getenv("TELEGRAM_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID") or os.getenv("telegram_chat_id", "")
    if not token or not chat_id:
        raise ValueError("TELEGRAM_TOKEN (ou TELEGRAM_BOT_TOKEN) et TELEGRAM_CHAT_ID requis")
    return token, chat_id


def escape_md_v2(text: str) -> str:
    return MDV2_ESCAPE.sub(r"\\\1", text)


def escape_md_v2_code(text: str) -> str:
    """Échappement à l'intérieur d'un span `code` (seuls ` et \\)."""
    return text.replace("\\", "\\\\").replace("`", "\\`")


def format_sentiment(value: Optional[float]) -> str:
    if value is None:
        return "n/a"
    sign = "+" if value >= 0 else "-"
    return f"{sign}{abs(value):.2f}"


def compact_sources(sources: list[dict[str, Any]], limit: int = 3) -> str:
    if not sources:
        return escape_md_v2("—")
    names: list[str] = []
    for src in sources:
        name = (src.get("name") or src.get("authority") or "").strip()
        if name and name not in names:
            names.append(name)
    if not names:
        return escape_md_v2("—")
    extra = len(names) - limit
    shown = [escape_md_v2(n) for n in names[:limit]]
    label = ", ".join(shown)
    if extra > 0:
        label += f" \\(\\+{extra}\\)"
    return label


def format_message(event: AlertEvent) -> str:
    ticker = escape_md_v2(event.symbol)
    etype = escape_md_v2(event.event_type or "Non classé")
    impact = event.impact_score if event.impact_score is not None else "?"
    impact_str = escape_md_v2(str(impact))

    body = (event.summary or event.title or "Pas de résumé disponible.").strip()
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()][:3]
    if not lines:
        lines = [body[:400]]
    summary = escape_md_v2("\n".join(lines))

    sentiment = escape_md_v2_code(
        format_sentiment(
            float(event.sentiment) if event.sentiment is not None else None
        )
    )
    conf = (
        escape_md_v2_code(str(event.confidence_pct))
        if event.confidence_pct is not None
        else "n/a"
    )
    sources = compact_sources(event.sources)

    return (
        f"*{ticker}* · {etype} · Impact *{impact_str}*\n\n"
        f"{summary}\n\n"
        f"Sentiment: `{sentiment}` · Confiance: `{conf}%`\n"
        f"Sources: {sources}"
    )


def load_pending(client: Client, limit: int) -> list[AlertEvent]:
    rows = (
        client.table("events")
        .select(
            "id, symbol, event_type, impact_score, summary, title, "
            "sentiment, confidence_pct, sources"
        )
        .eq("notified", False)
        .eq("filter_passed", True)
        .eq("llm_processed", True)
        .order("impact_score", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [AlertEvent.model_validate(r) for r in rows]


def send_telegram(token: str, chat_id: str, text: str) -> None:
    url = TELEGRAM_API.format(token=token)
    resp = requests.post(
        url,
        json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "MarkdownV2",
            "disable_web_page_preview": True,
        },
        timeout=30,
    )
    if resp.status_code >= 400:
        log.error("Telegram HTTP %s: %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()


def mark_notified(client: Client, event_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    client.table("events").update(
        {"notified": True, "notified_at": now, "updated_at": now}
    ).eq("id", event_id).execute()


def skip_low_impact(client: Client, event: AlertEvent) -> None:
    mark_notified(client, event.id)
    log.info(
        "Ignoré %s · %s · impact=%s (< seuil %d)",
        event.id[:8],
        event.symbol,
        event.impact_score,
        MIN_IMPACT,
    )


def notify_event(
    client: Client,
    event: AlertEvent,
    token: str,
    chat_id: str,
) -> bool:
    try:
        message = format_message(event)
        send_telegram(token, chat_id, message)
        mark_notified(client, event.id)
        log.info(
            "Notifié %s · %s · impact=%s",
            event.id[:8],
            event.symbol,
            event.impact_score,
        )
        return True
    except Exception as exc:
        log.warning(
            "Échec notification %s (%s): %s — event laissé notified=false",
            event.id[:8],
            event.symbol,
            exc,
        )
        return False


def run() -> None:
    try:
        token, chat_id = get_telegram_config()
    except ValueError as exc:
        log.error("%s", exc)
        return

    client = get_supabase()
    events = load_pending(client, MAX_NOTIFY)

    if not events:
        log.info("Aucune alerte à notifier.")
        return

    sent = 0
    failed = 0
    skipped = 0
    for event in events:
        if event.impact_score is not None and event.impact_score < MIN_IMPACT:
            skip_low_impact(client, event)
            skipped += 1
            continue
        if notify_event(client, event, token, chat_id):
            sent += 1
        else:
            failed += 1

    log.info(
        "Notifications terminées : %d envoyées, %d ignorées (impact), %d échecs.",
        sent,
        skipped,
        failed,
    )


def main() -> None:
    run()


if __name__ == "__main__":
    main()
