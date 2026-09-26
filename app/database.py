"""Conexión a PostgreSQL con SQLAlchemy 2.

La base de datos es opcional: si DATABASE_URL no está definida, la API pública
sigue funcionando con la key heredada del .env y el dashboard responde 503.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.config import get_settings


class UTCDateTime(TypeDecorator):
    """DateTime que siempre devuelve fechas con zona horaria UTC."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine | None:
    global _engine, _session_factory
    settings = get_settings()
    if not settings.database_enabled:
        return None
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            # Pool pequeño: el servidor tiene poca RAM y un solo worker.
            pool_size=5,
            max_overflow=5,
            pool_recycle=1800,
        )
        if _engine.dialect.name == "sqlite":
            # SQLite (solo tests) necesita activar las foreign keys explícitamente.
            event.listen(_engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session] | None:
    get_engine()
    return _session_factory


def reset_engine() -> None:
    """Cierra el engine (usado por los tests al cambiar de configuración)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def session_scope() -> Session:
    factory = get_session_factory()
    if factory is None:
        raise RuntimeError("Base de datos no configurada")
    return factory()


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por petición."""
    db = session_scope()
    try:
        yield db
    finally:
        db.close()
