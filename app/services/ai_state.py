"""Modo reposo de la IA: con la IA en pausa el modelo se descarga de la RAM y la API de chat responde 503.

El estado se guarda en la base (sobrevive a reinicios y despliegues) y se cachea unos segundos para no consultar
la base en cada petición.
"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import session_scope, utcnow
from app.models import PlatformState

KEY = "ai_power"
CACHE_SECONDS = 3.0
PAUSED_MESSAGE = "La IA está en pausa (modo reposo). Actívala desde el dashboard de DEVMARK AI."

_cache: dict[str, Any] = {"paused": False, "at": 0.0}


def reset_cache() -> None:
    _cache.update(paused=False, at=0.0)


def get_state(db: Session) -> dict[str, Any]:
    row = db.get(PlatformState, KEY)
    value = dict(row.value) if row else {}
    return {"paused": bool(value.get("paused")), "changed_at": value.get("changed_at"), "changed_by": value.get("changed_by")}


def set_paused(db: Session, paused: bool, by: str) -> dict[str, Any]:
    row = db.get(PlatformState, KEY)
    value = {"paused": paused, "changed_at": utcnow().isoformat(), "changed_by": by}
    if row is None:
        db.add(PlatformState(key=KEY, value=value))
    else:
        row.value = value
    db.commit()
    _cache.update(paused=paused, at=time.monotonic())
    return get_state(db)


def is_paused() -> bool:
    """¿Está la IA en pausa? (cacheado CACHE_SECONDS; si la base falla, se asume activa)."""
    if not get_settings().database_enabled:
        return False
    now = time.monotonic()
    if now - _cache["at"] < CACHE_SECONDS:
        return _cache["paused"]
    try:
        with session_scope() as db:
            paused = get_state(db)["paused"]
    except Exception:  # noqa: BLE001 - no bloquear la API por un fallo al leer el estado
        paused = False
    _cache.update(paused=paused, at=now)
    return paused
