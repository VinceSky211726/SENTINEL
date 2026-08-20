"""Chargement des secrets (GitHub Actions / .env)."""

from __future__ import annotations

import logging
import os

from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

log = logging.getLogger(__name__)

DEFAULT_SUPABASE_URL = "https://zayezktpxysiwlhbchqk.supabase.co"

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


def supabase_url() -> str:
    url = first_env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") or DEFAULT_SUPABASE_URL
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
