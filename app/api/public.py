"""API pública: los endpoints originales, con el mismo contrato de respuesta.

GET  /                      público (navegadores -> 302 a /dashboard/, el resto recibe el JSON de siempre)
GET  /status                público (JSON de / + estado de Ollama)
GET  /health                público (ahora comprueba Ollama de verdad)
GET  /llms.txt              público: guía de integración para agentes de IA
POST /v1/chat/completions   Authorization: Bearer <API_KEY>, permiso "chat"
GET  /v1/models             Authorization: Bearer <API_KEY>, permiso "models"
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Header, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.api.deps import authenticate, client_ip
from app.config import get_settings
from app.database import session_scope
from app.services import ai_state, llms_txt, ollama, rag, tools
from app.services.api_keys import KeyContext
from app.services.request_log import RequestLogEntry, write_log

router = APIRouter()


# --------------------------------------------------------------------------
# Esquemas
# --------------------------------------------------------------------------

class ContentPart(BaseModel):
    type: str = "text"
    text: str | None = None


class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool", "developer"]
    content: str | list[ContentPart] | None = ""
    # Function calling (formato OpenAI): llamadas del asistente y respuestas de herramientas del cliente.
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None

    def as_ollama(self) -> dict[str, Any]:
        if isinstance(self.content, list):
            content = "\n".join(part.text or "" for part in self.content if part.type == "text")
        else:
            content = self.content or ""
        # "developer" es el nuevo nombre de "system" en la API de OpenAI.
        role = "system" if self.role == "developer" else self.role
        item: dict[str, Any] = {"role": role, "content": content}
        if self.tool_calls:
            item["tool_calls"] = self.tool_calls
        if self.tool_call_id:
            item["tool_call_id"] = self.tool_call_id
        if self.name:
            item["name"] = self.name
        return item


class ToolFunction(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    description: str | None = Field(default=None, max_length=2000)
    parameters: dict[str, Any] | None = None


class ClientTool(BaseModel):
    type: Literal["function"] = "function"
    function: ToolFunction


class OpenAIChatRequest(BaseModel):
    model: str | None = None
    messages: list[Message] = Field(min_length=1)
    stream: bool = False
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    stop: str | list[str] | None = None
    # Function calling del cliente (formato OpenAI): el modelo devuelve tool_calls y la app ejecuta sus funciones.
    tools: list[ClientTool] | None = Field(default=None, max_length=16)
    tool_choice: str | dict[str, Any] | None = None
    # Extensión Devmark: forzar (true) o desactivar (false) el RAG de la aplicación. Por defecto, lo que diga la aplicación.
    rag: bool | None = None
    # Extensión Devmark: usar (por defecto) o no (false) las herramientas configuradas para la aplicación en el dashboard.
    server_tools: bool | None = None


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def openai_error(status_code: int, message: str, error_type: str, code: str, background: BackgroundTasks | None = None):
    return JSONResponse(
        status_code=status_code,
        content={"error": {"message": message, "type": error_type, "code": code}},
        background=background,
    )


def _validate_input(model: str, messages: list[dict[str, Any]]) -> JSONResponse | None:
    settings = get_settings()
    if settings.allowed_models and model not in settings.allowed_models:
        return openai_error(400, f"Modelo no permitido: {model}", "invalid_request_error", "model_not_allowed")
    if len(messages) > settings.max_messages:
        return openai_error(400, f"Máximo {settings.max_messages} mensajes por petición", "invalid_request_error", "too_many_messages")
    total_chars = sum(len(m["content"]) for m in messages)
    if total_chars > settings.max_input_chars:
        return openai_error(400, f"La entrada supera {settings.max_input_chars} caracteres", "invalid_request_error", "input_too_long")
    return None


def _log(
    background: BackgroundTasks,
    request: Request,
    context: KeyContext | None,
    endpoint: str,
    status_code: int,
    started: float,
    model: str | None = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    error: str | None = None,
    request_content: str | None = None,
    response_content: str | None = None,
) -> None:
    if not get_settings().database_enabled:
        return
    background.add_task(
        write_log,
        RequestLogEntry(
            endpoint=endpoint,
            method=request.method,
            status_code=status_code,
            processing_ms=round((time.perf_counter() - started) * 1000),
            api_key_id=context.api_key_id if context else None,
            application_id=context.application_id if context else None,
            key_prefix=context.prefix if context else None,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            error=error,
            client_ip=client_ip(request),
            request_content=request_content,
            response_content=response_content,
        ),
    )


def _rag_lookup(application_id, query: str, top_k: int) -> list[rag.SearchResult]:
    with session_scope() as db:
        return rag.search(db, application_id, query, top_k)


async def retrieve(context: KeyContext | None, messages: list[dict[str, Any]], force: bool | None) -> list[rag.SearchResult]:
    """Fragmentos de la aplicación relevantes para el último mensaje del usuario ([] si no aplica)."""
    enabled = context is not None and context.application_id is not None and (force if force is not None else context.rag_enabled)
    query = rag.last_user_message(messages)
    if not enabled or not query or not get_settings().database_enabled:
        return []
    try:
        return await run_in_threadpool(_rag_lookup, context.application_id, query, context.rag_top_k)
    except Exception:  # noqa: BLE001 - si la búsqueda falla, se responde sin contexto
        return []


def _load_tools(application_id) -> list[tools.LoadedTool]:
    with session_scope() as db:
        return tools.load_for_application(db, application_id)


async def server_tools_for(context: KeyContext | None, enabled: bool | None) -> list[tools.LoadedTool]:
    """Herramientas configuradas para la aplicación de la key ([] si no hay o se desactivan con server_tools=false)."""
    if enabled is False or context is None or context.application_id is None or not get_settings().database_enabled:
        return []
    try:
        return await run_in_threadpool(_load_tools, context.application_id)
    except Exception:  # noqa: BLE001 - si no se pueden cargar, se responde sin herramientas
        return []


def _messages_text(messages: list[dict[str, Any]]) -> str:
    return "\n".join(f"{m['role']}: {m['content']}" for m in messages)


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

def _service_info() -> dict[str, str]:
    return {"status": "online", "service": "Devmark AI API", "model": get_settings().default_model}


async def _ai_mode() -> str:
    return "paused" if await run_in_threadpool(ai_state.is_paused) else "active"


@router.get("/")
async def root(request: Request):
    # Negociación de contenido: un navegador (Accept con text/html) va al dashboard;
    # curl, SDKs, Accept: application/json, */* o sin Accept reciben el JSON de siempre.
    if "text/html" in request.headers.get("accept", "").lower():
        return RedirectResponse("/dashboard/", status_code=302, headers={"Vary": "Accept"})
    return JSONResponse(_service_info(), headers={"Vary": "Accept"})


@router.get("/status")
async def status():
    try:
        await ollama.version()
        ollama_state = "connected"
    except ollama.OllamaError:
        ollama_state = "unreachable"
    return {**_service_info(), "ollama": ollama_state, "ai": await _ai_mode()}


@router.get("/llms.txt", response_class=PlainTextResponse)
async def llms():
    """Guía de integración para agentes de IA (pública, sin secretos)."""
    return PlainTextResponse(llms_txt.render(), media_type="text/markdown; charset=utf-8", headers={"Cache-Control": "public, max-age=300"})


@router.get("/health")
async def health():
    try:
        await ollama.version()
    except ollama.OllamaError:
        return JSONResponse(status_code=503, content={"status": "degraded", "ollama": "unreachable"})
    if await _ai_mode() == "paused":
        return {"status": "paused", "ollama": "connected"}  # pausa intencional: no es una caída
    return {"status": "healthy", "ollama": "connected"}


@router.post("/v1/chat/completions")
async def openai_chat(
    body: OpenAIChatRequest,
    request: Request,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    context = await authenticate(authorization, "chat")
    if await run_in_threadpool(ai_state.is_paused):
        return openai_error(503, ai_state.PAUSED_MESSAGE, "service_unavailable", "ai_paused")
    settings = get_settings()
    started = time.perf_counter()
    start_time = time.time()

    model = body.model or settings.default_model
    messages = tools.openai_messages_to_ollama([m.as_ollama() for m in body.messages])
    invalid = _validate_input(model, messages)
    if invalid is not None:
        return invalid

    sources = await retrieve(context, messages, body.rag)
    messages = rag.augment_messages(messages, sources)

    options: dict[str, Any] = {}
    if body.temperature is not None:
        options["temperature"] = body.temperature
    if body.top_p is not None:
        options["top_p"] = body.top_p
    if body.max_tokens is not None:
        options["num_predict"] = body.max_tokens
    if body.stop is not None:
        options["stop"] = [body.stop] if isinstance(body.stop, str) else body.stop

    client_tools = [t.model_dump(exclude_none=True) for t in body.tools or []] if body.tool_choice != "none" else []
    run: tools.ToolRun | None = None
    try:
        if client_tools:
            data = await ollama.chat(model, messages, options or None, tools=client_tools)
        else:
            available = await server_tools_for(context, body.server_tools)
            if available:
                run = await tools.chat_with_tools(model, messages, options or None, available)
                data = run.data
            else:
                data = await ollama.chat(model, messages, options or None)
    except ollama.OllamaError as exc:
        _log(background, request, context, "/v1/chat/completions", exc.status_code, started, model, error=exc.message)
        return JSONResponse(status_code=exc.status_code, content=exc.to_openai(), background=background)

    reply = data.get("message") or {}
    content = reply.get("content", "")
    prompt_tokens = run.prompt_tokens if run else data.get("prompt_eval_count", 0) or 0
    completion_tokens = run.completion_tokens if run else data.get("eval_count", 0) or 0
    finish_reason = "length" if data.get("done_reason") == "length" else "stop"
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if client_tools and reply.get("tool_calls"):
        message = {"role": "assistant", "content": content or None, "tool_calls": tools.ollama_tool_calls_to_openai(reply["tool_calls"])}
        finish_reason = "tool_calls"

    _log(
        background, request, context, "/v1/chat/completions", 200, started, data.get("model", model),
        prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        request_content=_messages_text(messages), response_content=content,
    )

    return JSONResponse(
        {
            "id": f"devmark-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": data.get("model", model),
            "choices": [
                {
                    "index": 0,
                    "message": message,
                    "finish_reason": finish_reason,
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            "processing_time": round(time.time() - start_time, 2),
            **({"rag": {"sources": [s.as_dict(include_content=False) for s in sources]}} if sources else {}),
            **({"tools": {"calls": [c.as_dict() for c in run.calls]}} if run and run.calls else {}),
        },
        background=background,
    )


@router.get("/v1/models")
async def models(
    request: Request,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    context = await authenticate(authorization, "models")
    started = time.perf_counter()
    try:
        installed = await ollama.list_models()
    except ollama.OllamaError as exc:
        _log(background, request, context, "/v1/models", exc.status_code, started, error=exc.message)
        return JSONResponse(status_code=exc.status_code, content=exc.to_openai(), background=background)

    allowed = get_settings().allowed_models
    _log(background, request, context, "/v1/models", 200, started)
    return JSONResponse(
        {
            "object": "list",
            "data": [
                {"id": m["name"], "object": "model", "owned_by": "devmark"}
                for m in installed
                if not allowed or m["name"] in allowed
            ],
        },
        background=background,
    )
