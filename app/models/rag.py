from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UTCDateTime, utcnow


class RagDocument(Base):
    """Documento de conocimiento de una aplicación (FAQ, manual, catálogo…)."""

    __tablename__ = "rag_documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_type: Mapped[str] = mapped_column(String(16), default="text")  # text | txt | md | pdf
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    chunks: Mapped[list[RagChunk]] = relationship(back_populates="document", cascade="all, delete-orphan", passive_deletes=True)


class RagChunk(Base):
    """Fragmento indexable de un documento.

    `search_text` es el contenido en minúsculas, con y sin acentos (ver rag.index_text), sobre el que
    PostgreSQL construye el índice de texto completo en español (ver migración 0003). Preparado para añadir
    una columna `embedding vector(n)` con pgvector sin cambiar la API.
    """

    __tablename__ = "rag_chunks"
    __table_args__ = (Index("ix_rag_chunks_app", "application_id"),)

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rag_documents.id", ondelete="CASCADE"), index=True)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    ordinal: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    search_text: Mapped[str] = mapped_column(Text)

    document: Mapped[RagDocument] = relationship(back_populates="chunks")
