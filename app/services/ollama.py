"""Cliente de Ollama (solo accesible en 127.0.0.1:11434)."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.config import get_settings


class OllamaError(Exception):
    """Fallo al hablar con Ollama, traducido a un error HTTP para el cliente."""

    def __init__(self, status_code: int, message: str, error_type: str, code: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.error_type = error_type
        self.code = code

    def to_openai(self) -> dict[str, Any]:
        return {"error": {"message": self.message, "type": self.error_type, "code": self.code}}


_client: httpx.AsyncClient | None = None
_semaphore: asyncio.Semaphore | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        settings = get_settings()
        _client = httpx.AsyncClient(
            base_url=settings.ollama_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=5.0),
        )
    return _client


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().ollama_max_concurrency)
    return _semaphore


async def close() -> None:
    global _client, _semaphore
    if _client is not None:
        await _client.aclose()
    _client = None
    _semaphore = None


async def _request(method: str, path: str, **kwargs: Any) -> dict[str, Any]:
    try:
        response = await _get_client().request(method, path, **kwargs)
    except httpx.TimeoutException as exc:
        raise OllamaError(504, "El modelo tardó demasiado en responder", "timeout_error", "ollama_timeout") from exc
    except httpx.HTTPError as exc:
        raise OllamaError(503, "El servicio de modelos no está disponible", "service_unavailable", "ollama_unavailable") from exc

    if response.status_code == 404:
        detail = _error_detail(response)
        raise OllamaError(404, detail or "Modelo no encontrado", "invalid_request_error", "model_not_found")
    if response.status_code >= 400:
        raise OllamaError(502, "Error del servicio de modelos", "api_error", "ollama_error")
    try:
        return response.json()
    except ValueError as exc:
        raise OllamaError(502, "Respuesta inválida del servicio de modelos", "api_error", "ollama_bad_response") from exc


def _error_detail(response: httpx.Response) -> str | None:
    try:
        message = response.json().get("error")
    except ValueError:
        return None
    return str(message)[:200] if message else None


async def chat(
    model: str,
    messages: list[dict[str, Any]],
    options: dict[str, Any] | None = None,
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": False}
    if options:
        payload["options"] = options
    if tools:
        payload["tools"] = tools
    async with _get_semaphore():
        return await _request("POST", "/api/chat", json=payload)


async def list_models() -> list[dict[str, Any]]:
    data = await _request("GET", "/api/tags", timeout=10.0)
    return data.get("models", [])


async def running_models() -> list[dict[str, Any]]:
    data = await _request("GET", "/api/ps", timeout=5.0)
    return data.get("models", [])


async def version() -> str | None:
    data = await _request("GET", "/api/version", timeout=3.0)
    return data.get("version")
