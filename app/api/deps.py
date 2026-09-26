"""Dependencias compartidas: autenticación por API key y sesión de administrador."""

from __future__ import annotations

import hmac

from fastapi import Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db, session_scope
from app.models import AdminSession, User
from app.services import api_keys, rate_limit, sessions


def client_ip(request: Request) -> str | None:
    host = request.client.host if request.client else None
    # Detrás de Nginx la IP real llega en X-Real-IP (solo se confía si viene de localhost).
    if host in {"127.0.0.1", "::1"}:
        return request.headers.get("x-real-ip") or host
    return host


# --------------------------------------------------------------------------
# API pública: Authorization: Bearer <API_KEY>
# --------------------------------------------------------------------------

def _resolve_in_db(raw_key: str) -> api_keys.KeyContext:
    settings = get_settings()
    with session_scope() as db:
        return api_keys.resolve_platform_key(db, raw_key, settings)


async def authenticate(authorization: str | None, permission: str) -> api_keys.KeyContext:
    """Valida la API key. Mantiene los mensajes de error de la versión original."""
    settings = get_settings()

    if not authorization:
        raise HTTPException(status_code=401, detail="API key requerida")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Formato de autorización inválido")

    token = authorization.replace("Bearer ", "", 1).strip()

    if api_keys.check_legacy_key(token, settings):
        return api_keys.legacy_context()

    if not (settings.database_enabled and api_keys.looks_like_platform_key(token)):
        raise HTTPException(status_code=401, detail="API key inválida")

    try:
        context = await run_in_threadpool(_resolve_in_db, token)
    except api_keys.ApiKeyAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    except Exception:
        raise HTTPException(status_code=503, detail="Servicio de autenticación no disponible") from None

    if permission not in context.permissions:
        raise HTTPException(status_code=403, detail="La API key no tiene permiso para este endpoint")

    if not rate_limit.allow(f"key:{context.api_key_id}", context.rate_limit_rpm) or not rate_limit.allow(
        f"app:{context.application_id}", context.app_rate_limit_rpm
    ):
        raise HTTPException(status_code=429, detail="Límite de peticiones excedido")

    return context


# --------------------------------------------------------------------------
# Dashboard: cookie de sesión + cabecera CSRF en métodos que modifican datos
# --------------------------------------------------------------------------

def require_database() -> None:
    if not get_settings().database_enabled:
        raise HTTPException(status_code=503, detail="Base de datos no configurada")


def get_admin_db(_: None = Depends(require_database)):
    yield from get_db()


class AdminContext:
    def __init__(self, user: User, session: AdminSession):
        self.user = user
        self.session = session


def current_admin(request: Request, db: Session = Depends(get_admin_db)) -> AdminContext:
    token = request.cookies.get(sessions.SESSION_COOKIE)
    session = sessions.get_session(db, token)
    if session is None:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")

    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        sent = request.headers.get(sessions.CSRF_HEADER, "")
        if not hmac.compare_digest(sent.encode(), session.csrf_token.encode()):
            raise HTTPException(status_code=403, detail="Token CSRF inválido")

    return AdminContext(session.user, session)
