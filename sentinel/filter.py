"""Filtrage heuristique 5 étages — sans appel LLM."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from datasketch import MinHash
from dotenv import load_dotenv
from pydantic import BaseModel
from supabase import Client, create_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

MINHASH_THRESHOLD = 0.7
MINHASH_PERM = 128
FRESHNESS_HOURS = 24

# Noms legacy des colonnes stage_* en base (ordre = étages 1→5)
STAGE_BOOL_COLUMNS = (
    "stage_2_dedup_passed",       # 1 — hash dédup
    "stage_1_ticker_match",       # 2 — entités portefeuille
    "stage_3_source_authority",   # 3 — blacklist
    "stage_4_heuristic_passed",   # 4 — MinHash
    "stage_5_freshness_passed",   # 5 — fraîcheur
)

BLACKLIST_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bpub\b",
        r"publicit[eé]",
        r"sponsoris[eé]",
        r"\bsponsored\b",
        r"\bspam\b",
        r"top\s*10",
        r"top\s*5",
        r"top\s*20",
        r"meilleures?\s+actions?",
        r"actions?\s+[àa]\s+acheter",
        r"stock\s+picks?",
        r"click\s*here",
        r"gratuit",
        r"newsletter",
        r"promo(code)?",
    )
]


class PortfolioEntry(BaseModel):
    id: str
    symbol: str
    name: str
    news_query: Optional[str] = None
    finnhub_symbol: Optional[str] = None


class EventRow(BaseModel):
    id: str
    symbol: str
    content_hash: str
    raw_title: Optional[str] = None
    raw_body: Optional[str] = None
    published_at: Optional[datetime] = None
    detected_at: Optional[datetime] = None


def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


def parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def load_portfolio(client: Client) -> dict[str, PortfolioEntry]:
    rows = (
        client.table("portfolio")
        .select("id, symbol, name, news_query, finnhub_symbol")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    return {r["symbol"]: PortfolioEntry.model_validate(r) for r in rows}


def build_aliases(entry: PortfolioEntry) -> list[str]:
    aliases: set[str] = set()

    def add_phrase(raw: str) -> None:
        phrase = raw.strip().lower()
        if not phrase:
            return
        aliases.add(phrase)
        for token in re.findall(r"[\w&]+", phrase):
            if len(token) >= 4:
                aliases.add(token)

    if entry.news_query:
        add_phrase(entry.news_query)
    add_phrase(entry.name)
    if entry.finnhub_symbol and len(entry.finnhub_symbol) >= 4:
        add_phrase(entry.finnhub_symbol)

    # Tickers courts (SAN, BNP…) matchent trop de bruit — ignorer si < 4 car.
    if len(entry.symbol) >= 4:
        aliases.add(entry.symbol.lower())

    name_l = entry.name.lower()
    query_l = (entry.news_query or "").lower()
    if "santander" in name_l or "santander" in query_l:
        aliases.update({"santander", "banco santander"})
    if "paribas" in name_l:
        aliases.update({"paribas", "bnp paribas"})
        if len(entry.symbol) >= 3:
            aliases.add(entry.symbol.lower())
    if "stellantis" in name_l:
        aliases.add("stellantis")
    if "s&p" in name_l + query_l:
        aliases.update({"s&p", "s&p 500", "sp500", "s&p500"})
    return sorted(aliases, key=len, reverse=True)


def alias_in_text(alias: str, text: str) -> bool:
    """Match avec limites de mot (évite « san » dans « santander »)."""
    escaped = re.escape(alias)
    if re.search(r"[\s&]", alias):
        pattern = escaped
    else:
        pattern = rf"(?<![\w&]){escaped}(?![\w])"
    return re.search(pattern, text, re.IGNORECASE) is not None


def load_pending_events(client: Client) -> list[EventRow]:
    rows = (
        client.table("events")
        .select(
            "id, symbol, content_hash, raw_title, raw_body, published_at, detected_at"
        )
        .eq("filter_passed", False)
        .eq("llm_processed", False)
        .execute()
        .data
        or []
    )
    events: list[EventRow] = []
    for row in rows:
        events.append(
            EventRow(
                id=row["id"],
                symbol=row["symbol"],
                content_hash=row["content_hash"],
                raw_title=row.get("raw_title"),
                raw_body=row.get("raw_body"),
                published_at=parse_ts(row.get("published_at")),
                detected_at=parse_ts(row.get("detected_at")),
            )
        )
    return events


def load_passed_hashes(client: Client) -> set[str]:
    rows = (
        client.table("events")
        .select("content_hash")
        .eq("filter_passed", True)
        .execute()
        .data
        or []
    )
    return {r["content_hash"] for r in rows if r.get("content_hash")}


def event_text(event: EventRow) -> str:
    parts = [event.raw_title or "", event.raw_body or ""]
    return " ".join(p for p in parts if p).strip()


def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


def make_minhash(text: str) -> MinHash:
    mh = MinHash(num_perm=MINHASH_PERM)
    for token in tokenize(text):
        mh.update(token.encode("utf-8"))
    return mh


def stage1_dedup(
    event: EventRow,
    passed_hashes: set[str],
    seen_pending: set[str],
) -> tuple[bool, Optional[str]]:
    if not event.content_hash or not event.content_hash.strip():
        return False, "content_hash manquant"
    if event.content_hash in passed_hashes:
        return False, "doublon exact déjà validé (content_hash)"
    if event.content_hash in seen_pending:
        return False, "doublon exact dans le lot en cours"
    seen_pending.add(event.content_hash)
    return True, None


def stage2_portfolio(
    event: EventRow,
    portfolio: dict[str, PortfolioEntry],
    aliases_by_symbol: dict[str, list[str]],
) -> tuple[bool, Optional[str]]:
    entry = portfolio.get(event.symbol)
    if not entry:
        return False, f"symbol {event.symbol} absent du portefeuille actif"
    text = event_text(event).lower()
    if not text:
        return False, "texte vide — impossible de matcher une entité"
    aliases = aliases_by_symbol.get(event.symbol, [])
    if any(alias_in_text(alias, text) for alias in aliases):
        return True, None
    return False, f"aucune entité portefeuille trouvée pour {event.symbol}"


def stage3_blacklist(event: EventRow) -> tuple[bool, Optional[str]]:
    text = event_text(event)
    if not text:
        return False, "texte vide"
    for pattern in BLACKLIST_PATTERNS:
        match = pattern.search(text)
        if match:
            return False, f"blacklist: pattern « {match.group(0)} »"
    return True, None


def stage4_minhash(
    event: EventRow,
    text: str,
    minhash: MinHash,
    canonical: list[tuple[MinHash, str]],
) -> tuple[bool, Optional[str]]:
    for existing, canonical_id in canonical:
        if minhash.jaccard(existing) >= MINHASH_THRESHOLD:
            return False, f"quasi-doublon MinHash (≥{MINHASH_THRESHOLD}) de {canonical_id[:8]}…"
    canonical.append((minhash, event.id))
    return True, None


def stage5_freshness(event: EventRow, now: datetime) -> tuple[bool, Optional[str]]:
    ref = event.published_at or event.detected_at
    if not ref:
        return False, "date published_at/detected_at manquante"
    cutoff = now - timedelta(hours=FRESHNESS_HOURS)
    if ref < cutoff:
        age_h = (now - ref).total_seconds() / 3600
        return False, f"item trop ancien ({age_h:.0f}h > {FRESHNESS_HOURS}h)"
    return True, None


def apply_stage_flags(passed_stages: list[bool]) -> dict[str, Optional[bool]]:
    flags: dict[str, Optional[bool]] = {col: None for col in STAGE_BOOL_COLUMNS}
    for col, ok in zip(STAGE_BOOL_COLUMNS, passed_stages):
        flags[col] = ok
    return flags


def build_result(
    event: EventRow,
    *,
    filter_passed: bool,
    filter_stage_reached: int,
    rejected_at_stage: Optional[int] = None,
    rejection_reason: Optional[str] = None,
    stage_passed: list[bool],
) -> dict[str, Any]:
    flags = apply_stage_flags(stage_passed)
    row: dict[str, Any] = {
        "id": event.id,
        "filter_passed": filter_passed,
        "filter_stage_reached": filter_stage_reached,
        "rejected_at_stage": rejected_at_stage,
        "rejection_reason": rejection_reason,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    row.update(flags)
    return row


def filter_event(
    event: EventRow,
    portfolio: dict[str, PortfolioEntry],
    aliases_by_symbol: dict[str, list[str]],
    passed_hashes: set[str],
    seen_pending: set[str],
    minhash_canonical: list[tuple[MinHash, str]],
    now: datetime,
) -> dict[str, Any]:
    stage_passed: list[bool] = []

    ok, reason = stage1_dedup(event, passed_hashes, seen_pending)
    stage_passed.append(ok)
    if not ok:
        return build_result(
            event,
            filter_passed=False,
            filter_stage_reached=0,
            rejected_at_stage=1,
            rejection_reason=reason,
            stage_passed=stage_passed,
        )

    ok, reason = stage2_portfolio(event, portfolio, aliases_by_symbol)
    stage_passed.append(ok)
    if not ok:
        return build_result(
            event,
            filter_passed=False,
            filter_stage_reached=1,
            rejected_at_stage=2,
            rejection_reason=reason,
            stage_passed=stage_passed,
        )

    ok, reason = stage3_blacklist(event)
    stage_passed.append(ok)
    if not ok:
        return build_result(
            event,
            filter_passed=False,
            filter_stage_reached=2,
            rejected_at_stage=3,
            rejection_reason=reason,
            stage_passed=stage_passed,
        )

    text = event_text(event)
    mh = make_minhash(text) if text else MinHash(num_perm=MINHASH_PERM)
    ok, reason = stage4_minhash(event, text, mh, minhash_canonical)
    stage_passed.append(ok)
    if not ok:
        return build_result(
            event,
            filter_passed=False,
            filter_stage_reached=3,
            rejected_at_stage=4,
            rejection_reason=reason,
            stage_passed=stage_passed,
        )

    ok, reason = stage5_freshness(event, now)
    stage_passed.append(ok)
    if not ok:
        return build_result(
            event,
            filter_passed=False,
            filter_stage_reached=4,
            rejected_at_stage=5,
            rejection_reason=reason,
            stage_passed=stage_passed,
        )

    passed_hashes.add(event.content_hash)
    return build_result(
        event,
        filter_passed=True,
        filter_stage_reached=5,
        rejected_at_stage=None,
        rejection_reason=None,
        stage_passed=stage_passed,
    )


UPDATE_FIELDS = (
    "filter_passed",
    "filter_stage_reached",
    "rejected_at_stage",
    "rejection_reason",
    "updated_at",
    *STAGE_BOOL_COLUMNS,
)


def persist_results(client: Client, results: list[dict[str, Any]]) -> None:
    for row in results:
        payload = {k: row[k] for k in UPDATE_FIELDS}
        client.table("events").update(payload).eq("id", row["id"]).execute()


def run() -> None:
    client = get_supabase()
    portfolio = load_portfolio(client)
    if not portfolio:
        log.info("Portefeuille vide — rien à filtrer.")
        return

    aliases_by_symbol = {sym: build_aliases(entry) for sym, entry in portfolio.items()}
    passed_hashes = load_passed_hashes(client)
    events = load_pending_events(client)

    if not events:
        log.info("Aucun event en attente de filtrage.")
        return

    # Items récents d'abord — les canoniques MinHash favorisent le plus frais
    events.sort(
        key=lambda e: (e.published_at or e.detected_at or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )

    now = datetime.now(timezone.utc)
    seen_pending: set[str] = set()
    minhash_canonical: list[tuple[MinHash, str]] = []
    results: list[dict[str, Any]] = []
    stats = {"passed": 0, "rejected": 0, "by_stage": {i: 0 for i in range(1, 6)}}

    for event in events:
        row = filter_event(
            event,
            portfolio,
            aliases_by_symbol,
            passed_hashes,
            seen_pending,
            minhash_canonical,
            now,
        )
        results.append(row)
        if row["filter_passed"]:
            stats["passed"] += 1
        else:
            stats["rejected"] += 1
            stage = row.get("rejected_at_stage")
            if stage:
                stats["by_stage"][stage] = stats["by_stage"].get(stage, 0) + 1

    persist_results(client, results)
    log.info(
        "Filtrage terminé : %d traités, %d passés, %d rejetés — rejets par étage %s",
        len(results),
        stats["passed"],
        stats["rejected"],
        stats["by_stage"],
    )


def main() -> None:
    run()


if __name__ == "__main__":
    main()
