"""Ingestion async : RSS Google News + Finnhub → Supabase events."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Optional
from urllib.parse import quote

import aiohttp
from dotenv import load_dotenv
from pydantic import BaseModel
from supabase import Client, create_client

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

GOOGLE_NEWS_SOURCE_KEY = "google_news_rss"
FINNHUB_SOURCE_KEY = "finnhub"
NEWS_SINCE = "2024-08-18"
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
FINNHUB_NEWS = "https://finnhub.io/api/v1/company-news"


class PortfolioRow(BaseModel):
    id: str
    symbol: str
    is_active: bool = True
    news_query: Optional[str] = None
    finnhub_symbol: Optional[str] = None


class SourceRow(BaseModel):
    id: str
    source_key: str
    is_active: bool = True
    is_paused: bool = False


class NormalizedItem(BaseModel):
    title: str
    url: str
    published_at: datetime
    source_name: str
    symbol: str
    source_key: str
    raw_body: Optional[str] = None

    @property
    def content_hash(self) -> str:
        payload = f"{self.url}|{self.title}|{self.published_at.isoformat()}"
        return hashlib.sha256(payload.encode()).hexdigest()


def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)


def load_portfolio(client: Client) -> list[PortfolioRow]:
    rows = (
        client.table("portfolio")
        .select("id, symbol, is_active, news_query, finnhub_symbol")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    return [PortfolioRow.model_validate(r) for r in rows]


def load_sources(client: Client) -> dict[str, SourceRow]:
    rows = (
        client.table("source_registry")
        .select("id, source_key, is_active, is_paused")
        .eq("is_active", True)
        .eq("is_paused", False)
        .execute()
        .data
        or []
    )
    return {r["source_key"]: SourceRow.model_validate(r) for r in rows}


def parse_rss(xml_text: str, symbol: str) -> list[NormalizedItem]:
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    items: list[NormalizedItem] = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        url = (item.findtext("link") or "").strip()
        pub_raw = item.findtext("pubDate")
        if not title or not url or not pub_raw:
            continue

        source_el = item.find("source")
        source_name = (source_el.text if source_el is not None else "Google News") or "Google News"
        description = (item.findtext("description") or "").strip() or None

        try:
            published_at = parsedate_to_datetime(pub_raw)
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            published_at = datetime.now(timezone.utc)

        items.append(
            NormalizedItem(
                title=title,
                url=url,
                published_at=published_at,
                source_name=source_name.strip(),
                symbol=symbol,
                source_key=GOOGLE_NEWS_SOURCE_KEY,
                raw_body=description,
            )
        )
    return items


async def fetch_google_news(
    session: aiohttp.ClientSession,
    symbol: str,
    news_query: Optional[str] = None,
) -> list[NormalizedItem]:
    term = news_query or symbol
    query = quote(f"{term} after:{NEWS_SINCE}")
    url = f"{GOOGLE_NEWS_RSS}?q={query}&hl=fr&gl=FR&ceid=FR:fr"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            resp.raise_for_status()
            text = await resp.text()
        return parse_rss(text, symbol)
    except Exception as exc:
        log.warning("Google News RSS failed for %s: %s", symbol, exc)
        return []


async def fetch_finnhub(
    session: aiohttp.ClientSession,
    symbol: str,
    api_key: str,
    finnhub_symbol: str,
) -> list[NormalizedItem]:
    params = {
        "symbol": finnhub_symbol,
        "from": NEWS_SINCE,
        "to": date.today().isoformat(),
        "token": api_key,
    }
    try:
        async with session.get(FINNHUB_NEWS, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            resp.raise_for_status()
            payload: list[dict[str, Any]] = await resp.json()
    except Exception as exc:
        log.warning("Finnhub news failed for %s: %s", symbol, exc)
        return []

    items: list[NormalizedItem] = []
    for row in payload:
        title = (row.get("headline") or "").strip()
        url = (row.get("url") or "").strip()
        ts = row.get("datetime")
        if not title or not url or not ts:
            continue

        items.append(
            NormalizedItem(
                title=title,
                url=url,
                published_at=datetime.fromtimestamp(int(ts), tz=timezone.utc),
                source_name=(row.get("source") or "Finnhub").strip(),
                symbol=symbol,
                source_key=FINNHUB_SOURCE_KEY,
                raw_body=(row.get("summary") or "").strip() or None,
            )
        )
    return items


def to_event_row(
    item: NormalizedItem,
    portfolio_by_symbol: dict[str, PortfolioRow],
    sources: dict[str, SourceRow],
) -> dict[str, Any]:
    portfolio = portfolio_by_symbol.get(item.symbol)
    source = sources.get(item.source_key)
    return {
        "symbol": item.symbol,
        "portfolio_id": portfolio.id if portfolio else None,
        "source_id": source.id if source else None,
        "raw_title": item.title,
        "raw_url": item.url,
        "raw_body": item.raw_body,
        "content_hash": item.content_hash,
        "published_at": item.published_at.isoformat(),
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "filter_passed": False,
        "filter_stage_reached": 0,
        "llm_processed": False,
        "sources": [
            {
                "name": item.source_name,
                "url": item.url,
                "authority": item.source_key,
            }
        ],
    }


def insert_events(client: Client, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0

    (
        client.table("events")
        .upsert(rows, on_conflict="content_hash", ignore_duplicates=True)
        .execute()
    )
    return len(rows)


async def collect_items(
    portfolio: list[PortfolioRow],
    sources: dict[str, SourceRow],
    finnhub_key: str,
) -> list[NormalizedItem]:
    tasks: list[asyncio.Task[list[NormalizedItem]]] = []

    async with aiohttp.ClientSession(
        headers={"User-Agent": "Sentinel/0.1 (+https://github.com/VinceSky211726/SENTINEL)"}
    ) as session:
        for row in portfolio:
            if GOOGLE_NEWS_SOURCE_KEY in sources:
                tasks.append(
                    asyncio.create_task(
                        fetch_google_news(session, row.symbol, row.news_query)
                    )
                )
            if FINNHUB_SOURCE_KEY in sources and finnhub_key and row.finnhub_symbol:
                tasks.append(
                    asyncio.create_task(
                        fetch_finnhub(session, row.symbol, finnhub_key, row.finnhub_symbol)
                    )
                )

        results = await asyncio.gather(*tasks, return_exceptions=True)

    items: list[NormalizedItem] = []
    for result in results:
        if isinstance(result, Exception):
            log.warning("Fetch task error: %s", result)
            continue
        items.extend(result)
    return items


async def run() -> None:
    client = get_supabase()
    portfolio = load_portfolio(client)
    sources = load_sources(client)

    if not portfolio:
        log.info("No active portfolio rows — nothing to ingest.")
        return

    finnhub_key = os.getenv("FINNHUB_API_KEY", "")
    if FINNHUB_SOURCE_KEY in sources and not finnhub_key:
        log.warning("FINNHUB_API_KEY missing — skipping Finnhub source.")

    items = await collect_items(portfolio, sources, finnhub_key)
    if not items:
        log.info("No items fetched.")
        return

    portfolio_by_symbol = {p.symbol: p for p in portfolio}
    seen_hashes: set[str] = set()
    event_rows: list[dict[str, Any]] = []

    for item in items:
        h = item.content_hash
        if h in seen_hashes:
            continue
        seen_hashes.add(h)
        event_rows.append(to_event_row(item, portfolio_by_symbol, sources))

    inserted = insert_events(client, event_rows)
    log.info(
        "Ingestion done: %d fetched, %d unique, %d submitted (conflicts ignored).",
        len(items),
        len(event_rows),
        inserted,
    )


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
