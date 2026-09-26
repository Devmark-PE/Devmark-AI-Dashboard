from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UTCDateTime, utcnow


class ApiRequestLog(Base):
    """Registro de cada petición a la API pública.

    Por defecto NO se guarda el contenido de prompts ni respuestas
    (ver LOG_REQUEST_CONTENT).
    """

    __tablename__ = "api_request_logs"
    __table_args__ = (
        Index("ix_api_request_logs_created_at", "created_at"),
        Index("ix_api_request_logs_app_created", "application_id", "created_at"),
        Index("ix_api_request_logs_key_created", "api_key_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True
    )
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL"), nullable=True
    )
    # Copia del prefijo al momento de la petición ("legacy" para la key del .env),
    # para no perder la referencia si la key se elimina.
    key_prefix: Mapped[str | None] = mapped_column(String(32), nullable=True)
    endpoint: Mapped[str] = mapped_column(String(64))
    method: Mapped[str] = mapped_column(String(8), default="POST")
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    processing_ms: Mapped[int] = mapped_column(Integer, default=0)
    status_code: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), index=True)  # success | error
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_content: Mapped[str | None] = mapped_column(Text, nullable=True)
