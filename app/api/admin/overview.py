from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.admin.logs import serialize_log
from app.api.deps import AdminContext, current_admin, get_admin_db
from app.config import get_settings
from app.models import ApiKey, ApiRequestLog, Application
from app.services import ollama, stats

router = APIRouter(prefix="/overview", tags=["admin:overview"])


@router.get("")
async def overview(db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    settings = get_settings()

    try:
        await ollama.version()
        ollama_status = "online"
    except ollama.OllamaError:
        ollama_status = "offline"

    today = stats.usage(db, stats.resolve_range("today", settings.dashboard_timezone))
    recent = db.execute(
        select(ApiRequestLog, Application.name, ApiKey.name)
        .outerjoin(Application, ApiRequestLog.application_id == Application.id)
        .outerjoin(ApiKey, ApiRequestLog.api_key_id == ApiKey.id)
        .order_by(ApiRequestLog.id.desc())
        .limit(10)
    ).all()

    return {
        "api_status": "online",
        "ollama_status": ollama_status,
        "default_model": settings.default_model,
        "timezone": settings.dashboard_timezone,
        "total_requests": stats.total_requests(db),
        "today": today["totals"],
        "today_series": today["series"],
        "recent_requests": [serialize_log(log, app_name, key_name) for log, app_name, key_name in recent],
    }
