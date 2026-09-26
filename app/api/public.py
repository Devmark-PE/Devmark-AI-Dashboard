"""API pública: los endpoints originales, con el mismo contrato de respuesta.

GET  /                      público (navegadores -> 302 a /dashboard/, el resto recibe el JSON de siempre)
GET  /status                público (JSON de / + estado de Ollama)
GET  /health                público (ahora comprueba Ollama de verdad)
POST /v1/chat/completions   Authorization: Bearer <API_KEY>, permiso "chat"
GET  /v1/models             Authorization: Bearer <API_KEY>, permiso "models"
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Header, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.api.deps import authenticate, client_ip
from app.config import get_settings
from app.services import ollama
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

    def as_ollama(self) -> dict[str, str]:
        if isinstance(self.content, list):
            content = "\n".join(part.text or "" for part in self.content if part.type == "text")
        else:
            content = self.content or ""
        # "developer" es el nuevo nombre de "system" en la API de OpenAI.
        role = "system" if self.role == "developer" else self.role
        return {"role": role, "content": content}


class OpenAIChatRequest(BaseModel):
    model: str | None = None
    messages: list[Message] = Field(min_length=1)
    stream: bool = False
    temperature: float | None = Field(default=None, ge=0, le=2)
    top_p: float | None = Field(default=None, ge=0, le=1)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    stop: str | list[str] | None = None


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def openai_error(status_code: int, message: str, error_type: str, code: str, background: BackgroundTasks | None = None):
    return JSONResponse(
        status_code=status_code,
        content={"error": {"message": message, "type": error_type, "code": code}},
        background=background,
    )


def _validate_input(model: str, messages: list[dict[str, str]]) -> JSONResponse | None:
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


def _messages_text(messages: list[dict[str, str]]) -> str:
    return "\n".join(f"{m['role']}: {m['content']}" for m in messages)


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

def _service_info() -> dict[str, str]:
    return {"status": "online", "service": "Devmark AI API", "model": get_settings().default_model}


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
    return {**_service_info(), "ollama": ollama_state}


@router.get("/health")
async def health():
    try:
        await ollama.version()
    except ollama.OllamaError:
        return JSONResponse(status_code=503, content={"status": "degraded", "ollama": "unreachable"})
    return {"status": "healthy", "ollama": "connected"}


@router.post("/v1/chat/completions")
async def openai_chat(
    body: OpenAIChatRequest,
    request: Request,
    background: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    context = await authenticate(authorization, "chat")
    settings = get_settings()
    started = time.perf_counter()
    start_time = time.time()

    model = body.model or settings.default_model
    messages = [m.as_ollama() for m in body.messages]
    invalid = _validate_input(model, messages)
    if invalid is not None:
        return invalid

    options: dict[str, Any] = {}
    if body.temperature is not None:
        options["temperature"] = body.temperature
    if body.top_p is not None:
        options["top_p"] = body.top_p
    if body.max_tokens is not None:
        options["num_predict"] = body.max_tokens
    if body.stop is not None:
        options["stop"] = [body.stop] if isinstance(body.stop, str) else body.stop

    try:
        data = await ollama.chat(model, messages, options or None)
    except ollama.OllamaError as exc:
        _log(background, request, context, "/v1/chat/completions", exc.status_code, started, model, error=exc.message)
        return JSONResponse(status_code=exc.status_code, content=exc.to_openai(), background=background)

    content = data.get("message", {}).get("content", "")
    prompt_tokens = data.get("prompt_eval_count", 0) or 0
    completion_tokens = data.get("eval_count", 0) or 0
    finish_reason = "length" if data.get("done_reason") == "length" else "stop"

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
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": finish_reason,
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            "processing_time": round(time.time() - start_time, 2),
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
