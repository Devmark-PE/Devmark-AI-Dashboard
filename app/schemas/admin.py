"""Esquemas del API de administración (dashboard)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.api_keys import PERMISSIONS

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    value = value.strip().lower()
    if not EMAIL_RE.match(value) or len(value) > 255:
        raise ValueError("Email inválido")
    return value


def validate_permissions(value: list[str]) -> list[str]:
    unknown = set(value) - set(PERMISSIONS)
    if unknown:
        raise ValueError(f"Permisos desconocidos: {', '.join(sorted(unknown))}")
    if not value:
        raise ValueError("Selecciona al menos un permiso")
    return sorted(set(value))


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalize_email(value)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    last_login_at: datetime | None


class MeOut(BaseModel):
    user: UserOut
    csrf_token: str
    session_expires_at: datetime


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


# --- Applications ---

class ApplicationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=2000)
    rate_limit_rpm: int | None = Field(default=None, ge=1, le=100_000)
    monthly_token_quota: int | None = Field(default=None, ge=1)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str | None) -> str | None:
        if value is not None and value != "" and not SLUG_RE.match(value):
            raise ValueError("Solo minúsculas, números y guiones")
        return value or None


class ApplicationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["active", "disabled"] | None = None
    rate_limit_rpm: int | None = Field(default=None, ge=1, le=100_000)
    monthly_token_quota: int | None = Field(default=None, ge=1)
    rag_enabled: bool | None = None
    rag_top_k: int | None = Field(default=None, ge=1, le=8)


class ApplicationOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str
    status: str
    rate_limit_rpm: int | None
    monthly_token_quota: int | None
    created_at: datetime
    updated_at: datetime
    key_count: int = 0
    active_key_count: int = 0
    last_used_at: datetime | None = None
    requests_30d: int = 0
    rag_enabled: bool = False
    rag_top_k: int = 3
    document_count: int = 0


# --- API keys ---

class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    application_id: uuid.UUID
    environment: Literal["live", "test"] = "live"
    permissions: list[str] = Field(default_factory=lambda: list(PERMISSIONS))
    expires_at: datetime | None = None
    rate_limit_rpm: int | None = Field(default=None, ge=1, le=100_000)

    @field_validator("permissions")
    @classmethod
    def _permissions(cls, value: list[str]) -> list[str]:
        return validate_permissions(value)


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    permissions: list[str] | None = None
    rate_limit_rpm: int | None = Field(default=None, ge=1, le=100_000)

    @field_validator("permissions")
    @classmethod
    def _permissions(cls, value: list[str] | None) -> list[str] | None:
        return validate_permissions(value) if value is not None else None


class ApiKeyRegenerate(BaseModel):
    # Horas que la key anterior sigue funcionando (0 = se revoca al instante).
    grace_hours: Literal[0, 24, 168] = 24


class ApiKeyOut(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    masked_key: str
    environment: str
    permissions: list[str]
    status: str
    effective_status: str  # active | revoked | expired
    application_id: uuid.UUID
    application_name: str
    rate_limit_rpm: int | None
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None
    expires_at: datetime | None


class ApiKeyCreated(ApiKeyOut):
    # La key completa: se devuelve UNA sola vez, al crearla.
    key: str


# --- RAG ---

MAX_DOCUMENT_BYTES = 8 * 1024 * 1024


class RagDocumentCreate(BaseModel):
    application_id: uuid.UUID
    title: str = Field(min_length=2, max_length=200)
    # Texto pegado directamente, o un archivo (.txt/.md/.pdf) en base64.
    text: str | None = Field(default=None, max_length=2_000_000)
    filename: str | None = Field(default=None, max_length=255)
    content_base64: str | None = Field(default=None, max_length=12_000_000)


class RagSearchRequest(BaseModel):
    application_id: uuid.UUID
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=3, ge=1, le=10)


# --- Playground ---

class PlaygroundMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(max_length=48_000)


class PlaygroundRequest(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    messages: list[PlaygroundMessage] = Field(min_length=1, max_length=100)
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    application_id: uuid.UUID | None = None
    use_rag: bool = False
    top_k: int = Field(default=3, ge=1, le=8)
