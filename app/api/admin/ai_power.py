"""Modo reposo: pausar la IA (libera la RAM del modelo) y volver a activarla."""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.config import get_settings
from app.services import ai_state, ollama
from app.services.system import host_metrics

router = APIRouter(prefix="/ai-power", tags=["admin:ai-power"])
logger = logging.getLogger("devmark.ai_power")


class AiPowerRequest(BaseModel):
    paused: bool


async def _snapshot(db: Session) -> dict:
    state = ai_state.get_state(db)
    try:
        running = [m.get("name") or m.get("model") for m in await ollama.running_models()]
        ollama_ok = True
    except ollama.OllamaError:
        running, ollama_ok = [], False
    memory = host_metrics().get("memory")
    return {
        **state,
        "loaded_models": running,
        "ollama": "online" if ollama_ok else "offline",
        "default_model": get_settings().default_model,
        "memory": memory,
    }


async def _preload(model: str) -> None:
    try:
        await ollama.preload(model)
    except ollama.OllamaError as exc:
        logger.warning("No se pudo precargar %s: %s", model, exc.message)


@router.get("")
async def get_ai_power(db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    return await _snapshot(db)


@router.post("")
async def set_ai_power(
    body: AiPowerRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_admin_db),
    ctx: AdminContext = Depends(current_admin),
):
    ai_state.set_paused(db, body.paused, ctx.user.email)
    if body.paused:
        # Descarga todo lo que esté en memoria para liberar la RAM.
        try:
            for model in await ollama.running_models():
                name = model.get("name") or model.get("model")
                if name:
                    await ollama.unload(name)
        except ollama.OllamaError as exc:
            logger.warning("No se pudo descargar el modelo: %s", exc.message)
    else:
        # Carga el modelo por defecto en segundo plano: la primera respuesta ya será rápida.
        background.add_task(_preload, get_settings().default_model)
    return await _snapshot(db)
