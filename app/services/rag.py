"""RAG (Retrieval-Augmented Generation) con búsqueda de texto completo en PostgreSQL.

Flujo: documento → texto → fragmentos (~700 caracteres) → índice FTS en español (Supabase).
En cada pregunta se buscan los fragmentos más relevantes de la aplicación y se añaden como
contexto al system prompt. No usa RAM del servidor (sin modelo de embeddings).

Preparado para pgvector: añadir `rag_chunks.embedding vector(n)` y combinar puntuaciones en
`search()` sin cambiar los endpoints.
"""

from __future__ import annotations

import io
import re
import unicodedata
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import RagChunk, RagDocument

CHUNK_SIZE = 700
CHUNK_OVERLAP = 120
MAX_CONTEXT_CHARS = 2400  # el modelo tiene contexto de 2048 tokens: deja espacio a la conversación
MAX_QUERY_TERMS = 16
SUPPORTED_TYPES = {"text", "txt", "md", "pdf"}

CONTEXT_PROMPT = (
    "Responde usando la siguiente información de referencia. Si la respuesta no está en ella, "
    "dilo claramente y no inventes datos. Cita la fuente entre corchetes, por ejemplo [1].\n\n"
    "Información de referencia:\n{context}"
)


class RagError(ValueError):
    """Error con mensaje apto para el usuario."""


@dataclass
class SearchResult:
    chunk_id: int
    document_id: uuid.UUID
    title: str
    ordinal: int
    content: str
    score: float

    def as_dict(self, include_content: bool = True) -> dict:
        data = {
            "chunk_id": self.chunk_id,
            "document_id": str(self.document_id),
            "title": self.title,
            "ordinal": self.ordinal,
            "score": round(self.score, 4),
        }
        if include_content:
            data["content"] = self.content
        return data


# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------

def normalize(value: str) -> str:
    """Minúsculas y sin acentos: «¿Cuánto cuesta?» y «cuanto cuesta» se indexan igual."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped).strip()


WORD_RE = re.compile(r"[^\W_]{2,}")


def index_text(value: str) -> str:
    """Texto a indexar: la versión con acentos (para el stemmer en español: «ubicación» → «ubic»)
    y, si difiere, la versión sin acentos (para quien escribe sin tildes)."""
    lower = re.sub(r"\s+", " ", value.lower()).strip()
    plain = normalize(value)
    return lower if lower == plain else f"{lower}\n{plain}"


def query_terms(query: str) -> list[str]:
    """Palabras de la pregunta, con y sin acentos (sin duplicados)."""
    terms = WORD_RE.findall(query.lower()) + WORD_RE.findall(normalize(query))
    return list(dict.fromkeys(terms))[: MAX_QUERY_TERMS * 2]


def extract_text(source_type: str, data: bytes) -> str:
    if source_type not in SUPPORTED_TYPES:
        raise RagError("Formato no soportado. Usa .txt, .md o .pdf")
    if source_type == "pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
        except Exception as exc:  # noqa: BLE001 - PDF corrupto o cifrado
            raise RagError("No se pudo leer el PDF (¿está protegido o es una imagen escaneada?)") from exc
        content = "\n\n".join(p.strip() for p in pages if p.strip())
        if not content:
            raise RagError("El PDF no contiene texto extraíble (si es escaneado, necesita OCR)")
        return content
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise RagError("No se pudo leer el archivo como texto")


def chunk_text(content: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Divide en fragmentos respetando párrafos y frases; solapa un poco para no cortar ideas."""
    content = re.sub(r"\r\n?", "\n", content)
    paragraphs = [re.sub(r"[ \t]+", " ", p).strip() for p in re.split(r"\n\s*\n", content)]
    paragraphs = [p for p in paragraphs if p]

    pieces: list[str] = []
    for paragraph in paragraphs:
        if len(paragraph) <= size:
            pieces.append(paragraph)
            continue
        sentences = re.split(r"(?<=[.!?;:])\s+", paragraph)
        for sentence in sentences:
            while len(sentence) > size:  # frase enorme: corte duro por palabras
                cut = sentence.rfind(" ", 0, size)
                cut = cut if cut > size // 2 else size
                pieces.append(sentence[:cut].strip())
                sentence = sentence[cut:].strip()
            if sentence:
                pieces.append(sentence)

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if current and len(current) + 1 + len(piece) > size:
            chunks.append(current)
            tail = current[-overlap:]
            tail = tail[tail.find(" ") + 1:] if " " in tail else tail
            current = f"{tail} {piece}".strip() if overlap else piece
            if len(current) > size:
                current = piece
        else:
            current = f"{current}\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


# ---------------------------------------------------------------------------
# Ingesta
# ---------------------------------------------------------------------------

def ingest(
    db: Session,
    application_id: uuid.UUID,
    title: str,
    content: str,
    source_type: str = "text",
    filename: str | None = None,
    size_bytes: int | None = None,
    created_by_id: uuid.UUID | None = None,
) -> RagDocument:
    content = content.strip()
    if len(content) < 20:
        raise RagError("El documento está vacío o es demasiado corto")
    chunks = chunk_text(content)
    document = RagDocument(
        application_id=application_id,
        title=title.strip()[:200],
        filename=(filename or None) and filename[:255],
        source_type=source_type,
        size_bytes=size_bytes if size_bytes is not None else len(content.encode()),
        char_count=len(content),
        chunk_count=len(chunks),
        created_by_id=created_by_id,
    )
    db.add(document)
    db.flush()
    db.add_all(
        RagChunk(
            document_id=document.id,
            application_id=application_id,
            ordinal=index,
            content=chunk,
            search_text=index_text(f"{document.title}\n{chunk}"),
        )
        for index, chunk in enumerate(chunks)
    )
    db.commit()
    return document


# ---------------------------------------------------------------------------
# Búsqueda
# ---------------------------------------------------------------------------

def search(db: Session, application_id: uuid.UUID, query: str, top_k: int = 3) -> list[SearchResult]:
    terms = query_terms(query)
    if not terms:
        return []
    top_k = max(1, min(top_k, 10))
    if db.get_bind().dialect.name == "postgresql":
        return _search_postgres(db, application_id, terms, top_k)
    return _search_fallback(db, application_id, terms, top_k)


def _search_postgres(db: Session, application_id: uuid.UUID, terms: list[str], top_k: int) -> list[SearchResult]:
    # OR entre términos (recall alto); ts_rank_cd premia coincidencias múltiples y cercanas.
    tsquery = func.to_tsquery(text("'spanish'"), " | ".join(terms))
    vector = func.to_tsvector(text("'spanish'"), RagChunk.search_text)
    rank = func.ts_rank_cd(vector, tsquery).label("rank")
    rows = db.execute(
        select(RagChunk.id, RagChunk.document_id, RagDocument.title, RagChunk.ordinal, RagChunk.content, rank)
        .join(RagDocument, RagDocument.id == RagChunk.document_id)
        .where(RagChunk.application_id == application_id, vector.op("@@")(tsquery))
        .order_by(rank.desc(), RagChunk.id)
        .limit(top_k)
    ).all()
    return [SearchResult(r.id, r.document_id, r.title, r.ordinal, r.content, float(r.rank)) for r in rows]


def _search_fallback(db: Session, application_id: uuid.UUID, terms: list[str], top_k: int) -> list[SearchResult]:
    """Búsqueda simple para SQLite (tests/desarrollo): cuenta coincidencias de términos."""
    rows = db.execute(
        select(RagChunk.id, RagChunk.document_id, RagDocument.title, RagChunk.ordinal, RagChunk.content, RagChunk.search_text)
        .join(RagDocument, RagDocument.id == RagChunk.document_id)
        .where(RagChunk.application_id == application_id)
    ).all()
    scored = []
    for r in rows:
        words = WORD_RE.findall(r.search_text)
        score = sum(1 for t in terms for w in words if w.startswith(t[: max(4, len(t) - 2)]))
        if score:
            scored.append(SearchResult(r.id, r.document_id, r.title, r.ordinal, r.content, float(score)))
    scored.sort(key=lambda item: (-item.score, item.chunk_id))
    return scored[:top_k]


def build_context(results: list[SearchResult], max_chars: int = MAX_CONTEXT_CHARS) -> str:
    blocks, used = [], 0
    for index, result in enumerate(results, start=1):
        block = f"[{index}] {result.title}\n{result.content}"
        if used + len(block) > max_chars and blocks:
            break
        blocks.append(block[: max_chars - used])
        used += len(block)
    return CONTEXT_PROMPT.format(context="\n\n".join(blocks))


def augment_messages(messages: list[dict[str, str]], results: list[SearchResult]) -> list[dict[str, str]]:
    """Añade el contexto al system prompt (o crea uno) sin tocar el resto de la conversación."""
    if not results:
        return messages
    context = build_context(results)
    messages = [dict(m) for m in messages]
    if messages and messages[0]["role"] == "system":
        messages[0]["content"] = f"{messages[0]['content']}\n\n{context}"
    else:
        messages.insert(0, {"role": "system", "content": context})
    return messages


def last_user_message(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message["role"] == "user" and message["content"].strip():
            return message["content"]
    return ""


def stats(db: Session) -> tuple[int, int]:
    documents = db.scalar(select(func.count(RagDocument.id))) or 0
    chunks = db.scalar(select(func.count(RagChunk.id))) or 0
    return documents, chunks
