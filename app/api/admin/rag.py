from __future__ import annotations

import base64
import binascii
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.models import Application, RagChunk, RagDocument
from app.schemas.admin import MAX_DOCUMENT_BYTES, RagDocumentCreate, RagSearchRequest
from app.services import rag

router = APIRouter(prefix="/rag", tags=["admin:rag"])

EXTENSIONS = {".txt": "txt", ".md": "md", ".markdown": "md", ".pdf": "pdf"}


def _document_out(doc: RagDocument, app_name: str | None = None) -> dict:
    return {
        "id": str(doc.id),
        "application_id": str(doc.application_id),
        "application_name": app_name,
        "title": doc.title,
        "filename": doc.filename,
        "source_type": doc.source_type,
        "size_bytes": doc.size_bytes,
        "char_count": doc.char_count,
        "chunk_count": doc.chunk_count,
        "created_at": doc.created_at.isoformat(),
    }


def _app_or_404(db: Session, app_id: uuid.UUID) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    return app


@router.get("/documents")
def list_documents(application_id: uuid.UUID | None = None, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    query = select(RagDocument, Application.name).join(Application).order_by(RagDocument.created_at.desc())
    if application_id:
        query = query.where(RagDocument.application_id == application_id)
    return [_document_out(doc, name) for doc, name in db.execute(query)]


@router.post("/documents", status_code=201)
async def create_document(body: RagDocumentCreate, db: Session = Depends(get_admin_db), ctx: AdminContext = Depends(current_admin)):
    app = _app_or_404(db, body.application_id)
    if bool(body.text) == bool(body.content_base64):
        raise HTTPException(status_code=422, detail="Envía el texto o un archivo (uno de los dos)")

    if body.text:
        source_type, raw_size, content = "text", len(body.text.encode()), body.text
    else:
        extension = os.path.splitext(body.filename or "")[1].lower()
        source_type = EXTENSIONS.get(extension)
        if source_type is None:
            raise HTTPException(status_code=422, detail="Formato no soportado. Usa .txt, .md o .pdf")
        try:
            data = base64.b64decode(body.content_base64 or "", validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="Archivo mal codificado") from None
        if len(data) > MAX_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail="El archivo supera 8 MB")
        raw_size = len(data)
        try:
            content = await run_in_threadpool(rag.extract_text, source_type, data)
        except rag.RagError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None

    try:
        document = await run_in_threadpool(
            rag.ingest, db, app.id, body.title, content, source_type, body.filename, raw_size, ctx.user.id
        )
    except rag.RagError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return _document_out(document, app.name)


@router.get("/documents/{document_id}")
def get_document(document_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    doc = db.get(RagDocument, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    chunks = db.scalars(select(RagChunk).where(RagChunk.document_id == doc.id).order_by(RagChunk.ordinal)).all()
    return {**_document_out(doc, doc_app_name(db, doc)), "chunks": [{"ordinal": c.ordinal, "content": c.content} for c in chunks]}


def doc_app_name(db: Session, doc: RagDocument) -> str | None:
    app = db.get(Application, doc.application_id)
    return app.name if app else None


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    doc = db.get(RagDocument, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    db.delete(doc)
    db.commit()


@router.post("/search")
def search(body: RagSearchRequest, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    """Prueba de búsqueda: qué fragmentos se usarían como contexto para esta pregunta."""
    _app_or_404(db, body.application_id)
    results = rag.search(db, body.application_id, body.query, body.top_k)
    return {"query": body.query, "terms": rag.query_terms(body.query), "results": [r.as_dict() for r in results]}
