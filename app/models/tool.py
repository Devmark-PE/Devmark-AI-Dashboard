from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime, utcnow

# Qué herramientas puede usar cada aplicación.
application_tools = Table(
    "application_tools",
    Base.metadata,
    Column("application_id", ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True),
    Column("tool_id", ForeignKey("tools.id", ondelete="CASCADE"), primary_key=True),
)


class Tool(Base):
    """Herramienta que el modelo puede invocar (function calling) para consultar un sistema externo.

    kind = "http": llama a una API (GET/POST) con la URL/cuerpo rellenados con los argumentos del modelo.
    kind = "web":  descarga una página y devuelve su texto.
    Las cabeceras se guardan cifradas (ver app.services.secrets); la API del dashboard nunca devuelve sus valores.
    """

    __tablename__ = "tools"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(48), unique=True, index=True)  # nombre de función: buscar_lead
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(16), default="http")  # http | web
    method: Mapped[str] = mapped_column(String(8), default="GET")  # GET | POST
    url_template: Mapped[str] = mapped_column(Text)
    body_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"name": "Authorization", "value_enc": "..."}]
    headers: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # [{"name": "nombre", "type": "string", "description": "...", "required": true, "enum": [...]}]
    parameters: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    response_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    max_chars: Mapped[int] = mapped_column(Integer, default=1500, server_default="1500")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    applications = relationship("Application", secondary=application_tools, back_populates="tools")
