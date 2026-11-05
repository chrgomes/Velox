"""Server-side translations (emails and other server-rendered text).

Catalogs are JSON files in ``app/locales/<locale>.json`` with flat dotted keys.
Missing keys fall back to English; a test asserts every catalog has every key.
"""

import json
from functools import lru_cache
from pathlib import Path
from string import Template

from app.core.config import SUPPORTED_LOCALES

LOCALES_DIR = Path(__file__).resolve().parent.parent / "locales"
DEFAULT_LOCALE = "en"


@lru_cache
def catalog(locale: str) -> dict[str, str]:
    path = LOCALES_DIR / f"{locale}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def t(key: str, locale: str = DEFAULT_LOCALE, **params: object) -> str:
    text = catalog(normalize_locale(locale)).get(key) or catalog(DEFAULT_LOCALE).get(key) or key
    return Template(text).safe_substitute({k: str(v) for k, v in params.items()})


def normalize_locale(value: str | None) -> str:
    if not value:
        return DEFAULT_LOCALE
    if value in SUPPORTED_LOCALES:
        return value
    lang = value.split("-")[0].split("_")[0].lower()
    return {"en": "en", "fr": "fr-CA", "es": "es-419"}.get(lang, DEFAULT_LOCALE)


def negotiate(accept_language: str | None) -> str:
    """Pick the best supported locale from an Accept-Language header."""
    if not accept_language:
        return DEFAULT_LOCALE
    candidates: list[tuple[float, str]] = []
    for part in accept_language.split(","):
        piece = part.strip().split(";")
        tag = piece[0].strip()
        q = 1.0
        for param in piece[1:]:
            if param.strip().startswith("q="):
                try:
                    q = float(param.strip()[2:])
                except ValueError:
                    q = 0.0
        if tag:
            candidates.append((q, tag))
    for _, tag in sorted(candidates, key=lambda c: -c[0]):
        lang = tag.split("-")[0].lower()
        if lang in ("en", "fr", "es"):
            return normalize_locale(tag)
    return DEFAULT_LOCALE
