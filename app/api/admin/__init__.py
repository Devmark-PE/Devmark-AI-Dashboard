from fastapi import APIRouter

from app.api.admin import (
    ai_power,
    applications,
    auth,
    keys,
    logs,
    models,
    overview,
    playground,
    rag,
    settings,
    system,
    tools,
    usage,
)

router = APIRouter(prefix="/api/admin")
for module in (auth, overview, ai_power, applications, keys, logs, usage, models, system, settings, rag, tools, playground):
    router.include_router(module.router)
