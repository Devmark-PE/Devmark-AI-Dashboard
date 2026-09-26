from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime, utcnow

if TYPE_CHECKING:
    from app.models.api_key import ApiKey


class Application(Base):
    """Aplicación que consume la API (Devmark Web, DentalSoft, ...)."""

    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | disabled
    # Preparado para límites/cuotas por aplicación (None = sin límite).
    rate_limit_rpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_token_quota: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    api_keys: Mapped[list[ApiKey]] = relationship(back_populates="application")
