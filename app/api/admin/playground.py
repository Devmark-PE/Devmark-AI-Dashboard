from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, client_ip, current_admin, get_admin_db
from app.database import session_scope
from app.models import Application
from app.schemas.admin import PlaygroundRequest
from app.services import ollama, rag
from app.services.request_log import RequestLogEntry, write_log

router = APIRouter(prefix="/playground", tags=["admin:playground"])


def _search(application_id, query: str, top_k: int) -> list[rag.SearchResult]:
    with session_scope() as db:
        return rag.search(db, application_id, query, top_k)


@router.post("/chat")
async def playground_chat(
    body: PlaygroundRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_admin_db),
    _: AdminContext = Depends(current_admin),
):
    """Chat de prueba desde el dashboard: usa el Ollama del servidor con la sesión del administrador
    (sin API key). Opcionalmente añade el contexto RAG de una aplicación."""
    if body.use_rag and body.application_id is None:
        raise HTTPException(status_code=422, detail="Elige una aplicación para usar sus documentos")
    if body.application_id is not None and db.get(Application, body.application_id) is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")

    messages = [m.model_dump() for m in body.messages]
    sources: list[rag.SearchResult] = []
    rag_ms = None
    if body.use_rag:
        started_rag = time.perf_counter()
        sources = await run_in_threadpool(_search, body.application_id, rag.last_user_message(messages), body.top_k)
        rag_ms = round((time.perf_counter() - started_rag) * 1000)
        messages = rag.augment_messages(messages, sources)

    options: dict[str, Any] = {}
    if body.temperature is not None:
        options["temperature"] = body.temperature
    if body.max_tokens is not None:
        options["num_predict"] = body.max_tokens

    started = time.perf_counter()

    def log(status_code: int, prompt: int = 0, completion: int = 0, error: str | None = None, model: str | None = None) -> None:
        background.add_task(
            write_log,
            RequestLogEntry(
                endpoint="/playground",
                status_code=status_code,
                processing_ms=round((time.perf_counter() - started) * 1000),
                application_id=body.application_id,
                key_prefix="playground",
                model=model or body.model,
                prompt_tokens=prompt,
                completion_tokens=completion,
                error=error,
                client_ip=client_ip(request),
            ),
        )

    try:
        data = await ollama.chat(body.model, messages, options or None)
    except ollama.OllamaError as exc:
        log(exc.status_code, error=exc.message)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message}, background=background)

    prompt_tokens = data.get("prompt_eval_count", 0) or 0
    completion_tokens = data.get("eval_count", 0) or 0
    log(200, prompt_tokens, completion_tokens, model=data.get("model"))
    return JSONResponse(
        {
            "model": data.get("model", body.model),
            "content": (data.get("message") or {}).get("content", ""),
            "finish_reason": "length" if data.get("done_reason") == "length" else "stop",
            "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens},
            "processing_ms": round((time.perf_counter() - started) * 1000),
            "load_ms": round((data.get("load_duration") or 0) / 1e6),
            "rag": {"used": body.use_rag, "search_ms": rag_ms, "sources": [s.as_dict() for s in sources]} if body.use_rag else None,
        },
        background=background,
    )
