from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime, utcnow


class User(Base):
    """Usuario administrador del dashboard (independiente de las API keys)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    # --- 2FA (TOTP, RFC 6238) ---
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Secreto generado durante la configuración, antes de confirmar el primer código.
    totp_pending_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Último paso de tiempo aceptado: impide reutilizar el mismo código (replay).
    totp_last_step: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Hashes SHA-256 de los códigos de recuperación de un solo uso.
    recovery_codes: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    sessions: Mapped[list[AdminSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AdminSession(Base):
    """Sesión del dashboard. En la base solo se guarda el hash del token de la cookie."""

    __tablename__ = "admin_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class PasswordResetToken(Base):
    """Enlace de recuperación de contraseña: solo se guarda el hash; un solo uso; caduca en 30 min."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
