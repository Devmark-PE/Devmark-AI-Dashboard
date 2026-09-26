from fastapi import APIRouter

from app.api.admin import (
    applications,
    auth,
    keys,
    logs,
    models,
    overview,
    settings,
    system,
    usage,
)

router = APIRouter(prefix="/api/admin")
for module in (auth, overview, applications, keys, logs, usage, models, system, settings):
    router.include_router(module.router)
