"""Chargement des secrets (GitHub Actions / .env)."""

from __future__ import annotations

import logging
import os
import re
from typing import Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

log = logging.getLogger(__name__)

PROJECT_REF = "zayezktpxysiwlhbchqk"
DEFAULT_SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"

KEY_ENV_NAMES = (
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
)


def first_env(*names: str) -> str:
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def normalize_supabase_url(raw: str) -> str:
    """Accepte l'URL API, le ref projet, ou l'URL du dashboard."""
    value = raw.strip().rstrip("/")
    if re.fullmatch(r"[a-z0-9]{20}", value):
        return f"https://{value}.supabase.co"

    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.hostname or "").lower()

    if host.endswith(".supabase.co") and host.count(".") >= 2:
        return f"https://{host}"

    match = re.search(r"/dashboard/project/([a-z0-9]+)", parsed.path or "")
    if match:
        return f"https://{match.group(1)}.supabase.co"

    if "supabase.com" in host:
        log.warning(
            "SUPABASE_URL pointe vers %s (dashboard) — repli sur %s",
            host,
            DEFAULT_SUPABASE_URL,
        )
        return DEFAULT_SUPABASE_URL

    return value


def supabase_url() -> str:
    raw = first_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") or DEFAULT_SUPABASE_URL
    url = normalize_supabase_url(raw)
    if not url:
        raise RuntimeError("SUPABASE_URL manquant (secret GitHub ou .env).")
    return url


def supabase_keys() -> list[tuple[str, str]]:
    """(env_name, key) uniques, non vides."""
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for name in KEY_ENV_NAMES:
        key = first_env(name)
        if key and key not in seen:
            seen.add(key)
            out.append((name, key))
    return out


def supabase_key() -> str:
    keys = supabase_keys()
    if not keys:
        raise RuntimeError(
            "Aucune clé Supabase. Ajoute un secret GitHub parmi : "
            "SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY."
        )
    return keys[0][1]


def get_supabase() -> Client:
    url = supabase_url()
    keys = supabase_keys()
    if not keys:
        raise RuntimeError(
            "Aucune clé Supabase. Ajoute un secret GitHub parmi : "
            "SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY."
        )

    last_error: Optional[Exception] = None
    for name, key in keys:
        client = create_client(url, key)
        try:
            client.table("portfolio").select("id").limit(1).execute()
            log.info("Supabase OK via %s (%s…)", name, key[:6])
            return client
        except Exception as exc:
            last_error = exc
            log.warning("Clé %s refusée : %s", name, exc)

    raise RuntimeError(
        "Connexion Supabase impossible avec les clés fournies. "
        f"Dernière erreur : {last_error}"
    ) from last_error
