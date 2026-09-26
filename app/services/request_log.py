"""Escritura de logs de peticiones (se ejecuta en segundo plano)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from app.config import get_settings
from app.database import session_scope
from app.models import ApiRequestLog

logger = logging.getLogger("devmark.request_log")

MAX_CONTENT_CHARS = 20_000


@dataclass
class RequestLogEntry:
    endpoint: str
    status_code: int
    processing_ms: int
    method: str = "POST"
    api_key_id: uuid.UUID | None = None
    application_id: uuid.UUID | None = None
    key_prefix: str | None = None
    model: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    error: str | None = None
    client_ip: str | None = None
    request_content: str | None = None
    response_content: str | None = None


def write_log(entry: RequestLogEntry) -> None:
    settings = get_settings()
    if not settings.database_enabled:
        return
    store_content = settings.log_request_content
    row = ApiRequestLog(
        api_key_id=entry.api_key_id,
        application_id=entry.application_id,
        key_prefix=entry.key_prefix,
        endpoint=entry.endpoint,
        method=entry.method,
        model=(entry.model or None) and entry.model[:120],
        prompt_tokens=entry.prompt_tokens,
        completion_tokens=entry.completion_tokens,
        total_tokens=entry.prompt_tokens + entry.completion_tokens,
        processing_ms=entry.processing_ms,
        status_code=entry.status_code,
        status="success" if entry.status_code < 400 else "error",
        error=entry.error[:500] if entry.error else None,
        client_ip=entry.client_ip,
        request_content=entry.request_content[:MAX_CONTENT_CHARS] if store_content and entry.request_content else None,
        response_content=entry.response_content[:MAX_CONTENT_CHARS] if store_content and entry.response_content else None,
    )
    try:
        with session_scope() as db:
            db.add(row)
            db.commit()
    except Exception:  # un fallo de log nunca debe tumbar la API
        logger.exception("No se pudo guardar el log de la petición")
