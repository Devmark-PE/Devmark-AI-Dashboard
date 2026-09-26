"""Sesiones del dashboard: cookie HttpOnly + token CSRF por sesión."""

from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import utcnow
from app.models import AdminSession, User

SESSION_COOKIE = "dmk_session"
CSRF_HEADER = "X-CSRF-Token"
# last_seen_at se actualiza como máximo cada 5 minutos.
_TOUCH_INTERVAL = timedelta(minutes=5)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, ip: str | None, user_agent: str | None) -> tuple[str, AdminSession]:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    now = utcnow()
    session = AdminSession(
        user_id=user.id,
        token_hash=_hash(token),
        csrf_token=secrets.token_urlsafe(32),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_ttl_hours),
        ip=ip,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    # Limpieza oportunista de sesiones caducadas.
    db.execute(delete(AdminSession).where(AdminSession.expires_at < now))
    db.commit()
    return token, session


def get_session(db: Session, token: str | None) -> AdminSession | None:
    if not token:
        return None
    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == _hash(token)))
    if session is None:
        return None
    now = utcnow()
    if session.expires_at <= now or not session.user.is_active:
        return None
    if now - session.last_seen_at >= _TOUCH_INTERVAL:
        session.last_seen_at = now
        db.commit()
    return session


def delete_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(AdminSession).where(AdminSession.token_hash == _hash(token)))
        db.commit()


# --- Protección contra fuerza bruta en el login (en memoria) ---

_MAX_FAILURES = 5
_WINDOW = 15 * 60
_lock = threading.Lock()
_failures: dict[str, deque[float]] = defaultdict(deque)


def _prune(bucket: deque[float], now: float) -> None:
    while bucket and now - bucket[0] >= _WINDOW:
        bucket.popleft()


def login_blocked(key: str) -> bool:
    now = time.monotonic()
    with _lock:
        bucket = _failures[key]
        _prune(bucket, now)
        return len(bucket) >= _MAX_FAILURES


def register_failure(key: str) -> None:
    with _lock:
        _failures[key].append(time.monotonic())


def clear_failures(key: str) -> None:
    with _lock:
        _failures.pop(key, None)


def reset_throttle() -> None:
    with _lock:
        _failures.clear()
