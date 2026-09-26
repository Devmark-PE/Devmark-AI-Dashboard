"""Generación y validación de API keys.

Formato:  dmk_live_<40 caracteres base62>   (dmk_test_ para claves de prueba)
Se guarda: HMAC-SHA256(API_KEY_PEPPER, key) y el prefijo visible dmk_live_XXXXXX.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import string
import uuid
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.database import utcnow
from app.models import ApiKey, Application

ALPHABET = string.ascii_letters + string.digits
RANDOM_LENGTH = 40
VISIBLE_RANDOM_CHARS = 6
ENVIRONMENTS = ("live", "test")
PERMISSIONS = ("chat", "models")
LEGACY_PREFIX = "legacy"
# last_used_at se actualiza como máximo una vez por minuto por key.
LAST_USED_RESOLUTION = timedelta(seconds=60)


@dataclass
class KeyContext:
    """Quién está llamando a la API pública."""

    api_key_id: uuid.UUID | None
    application_id: uuid.UUID | None
    prefix: str
    permissions: list[str] = field(default_factory=lambda: list(PERMISSIONS))
    rate_limit_rpm: int | None = None
    app_rate_limit_rpm: int | None = None
    rag_enabled: bool = False
    rag_top_k: int = 3

    @property
    def is_legacy(self) -> bool:
        return self.api_key_id is None


class ApiKeyAuthError(Exception):
    """Error de autenticación con mensaje apto para el cliente."""

    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def generate_key(environment: str = "live") -> str:
    if environment not in ENVIRONMENTS:
        raise ValueError("environment inválido")
    random_part = "".join(secrets.choice(ALPHABET) for _ in range(RANDOM_LENGTH))
    return f"dmk_{environment}_{random_part}"


def key_prefix(raw_key: str) -> str:
    head, _, rest = raw_key.rpartition("_")
    return f"{head}_{rest[:VISIBLE_RANDOM_CHARS]}"


def hash_key(raw_key: str, pepper: str) -> str:
    return hmac.new(pepper.encode(), raw_key.encode(), hashlib.sha256).hexdigest()


def looks_like_platform_key(raw_key: str) -> bool:
    parts = raw_key.split("_")
    return (
        len(parts) == 3
        and parts[0] == "dmk"
        and parts[1] in ENVIRONMENTS
        and len(parts[2]) == RANDOM_LENGTH
    )


def check_legacy_key(raw_key: str, settings: Settings) -> bool:
    if not (settings.legacy_api_key_enabled and settings.legacy_api_key):
        return False
    return hmac.compare_digest(raw_key.encode(), settings.legacy_api_key.encode())


def legacy_context() -> KeyContext:
    return KeyContext(api_key_id=None, application_id=None, prefix=LEGACY_PREFIX)


def resolve_platform_key(db: Session, raw_key: str, settings: Settings) -> KeyContext:
    """Valida una key contra la base de datos. Lanza ApiKeyAuthError si no es válida."""
    digest = hash_key(raw_key, settings.api_key_pepper or "")
    row = db.execute(
        select(ApiKey, Application)
        .join(Application, ApiKey.application_id == Application.id)
        .where(ApiKey.key_hash == digest)
    ).first()
    if row is None:
        raise ApiKeyAuthError("API key inválida")

    key, app = row
    now = utcnow()
    if key.status != "active":
        raise ApiKeyAuthError("API key revocada")
    if key.expires_at is not None and key.expires_at <= now:
        raise ApiKeyAuthError("API key expirada")
    if app.status != "active":
        raise ApiKeyAuthError("Aplicación deshabilitada", status_code=403)

    if key.last_used_at is None or now - key.last_used_at >= LAST_USED_RESOLUTION:
        key.last_used_at = now
        db.commit()

    return KeyContext(
        api_key_id=key.id,
        application_id=app.id,
        prefix=key.prefix,
        permissions=list(key.permissions or []),
        rate_limit_rpm=key.rate_limit_rpm,
        app_rate_limit_rpm=app.rate_limit_rpm,
        rag_enabled=bool(app.rag_enabled),
        rag_top_k=app.rag_top_k or 3,
    )


def mask(prefix: str) -> str:
    return f"{prefix}{'•' * 12}"
