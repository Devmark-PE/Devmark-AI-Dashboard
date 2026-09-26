from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime, utcnow
from app.models.application import Application

JSONType = JSON().with_variant(JSONB(), "postgresql")


class ApiKey(Base):
    """API key de un cliente.

    La key completa NUNCA se guarda: solo su HMAC-SHA256 (key_hash) y un prefijo
    visible (p. ej. "dmk_live_Ab3dE9") para reconocerla en el dashboard.
    """

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(32), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    environment: Mapped[str] = mapped_column(String(8), default="live")  # live | test
    permissions: Mapped[list[str]] = mapped_column(JSONType, default=list)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | revoked
    # Preparado para rate limiting por key (None = sin límite propio).
    rate_limit_rpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    application: Mapped[Application] = relationship(back_populates="api_keys")
