"""Chargement des secrets (GitHub Actions / .env)."""

from __future__ import annotations

import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

DEFAULT_SUPABASE_URL = "https://zayezktpxysiwlhbchqk.supabase.co"


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


def supabase_key() -> str:
    key = first_env(
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SERVICE_ROLE_KEY",
        "SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    )
    if not key:
        raise RuntimeError(
            "Aucune clé Supabase. Ajoute un secret GitHub parmi : "
            "SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY."
        )
    return key


def get_supabase() -> Client:
    return create_client(supabase_url(), supabase_key())
