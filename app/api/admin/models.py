from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.api.deps import AdminContext, current_admin
from app.config import get_settings
from app.services import ollama

router = APIRouter(prefix="/models", tags=["admin:models"])


@router.get("")
async def list_models(_: AdminContext = Depends(current_admin)):
    """Modelos instalados según Ollama. Nunca se inventan: si Ollama no responde, la lista va vacía."""
    settings = get_settings()
    installed, running = await asyncio.gather(ollama.list_models(), ollama.running_models(), return_exceptions=True)
    if isinstance(installed, Exception):
        message = installed.message if isinstance(installed, ollama.OllamaError) else "Error consultando Ollama"
        return {"ollama_status": "offline", "error": message, "default_model": settings.default_model, "models": []}

    loaded = {m.get("name"): m for m in running} if isinstance(running, list) else {}
    models = []
    for m in installed:
        details = m.get("details") or {}
        name = m.get("name")
        live = loaded.get(name)
        models.append(
            {
                "name": name,
                "size": m.get("size"),
                "modified_at": m.get("modified_at"),
                "digest": (m.get("digest") or "")[:12],
                "family": details.get("family"),
                "parameter_size": details.get("parameter_size"),
                "quantization": details.get("quantization_level"),
                "format": details.get("format"),
                "is_default": name == settings.default_model,
                "allowed": not settings.allowed_models or name in settings.allowed_models,
                "loaded": live is not None,
                "loaded_size_vram": live.get("size_vram") if live else None,
                "loaded_until": live.get("expires_at") if live else None,
            }
        )
    models.sort(key=lambda item: (not item["is_default"], item["name"] or ""))
    return {
        "ollama_status": "online",
        "error": None,
        "default_model": settings.default_model,
        "default_installed": any(item["is_default"] for item in models),
        "models": models,
    }
