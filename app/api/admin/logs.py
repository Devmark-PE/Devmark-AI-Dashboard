from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.config import get_settings
from app.models import ApiKey, ApiRequestLog, Application

router = APIRouter(prefix="/logs", tags=["admin:logs"])


def serialize_log(log: ApiRequestLog, app_name: str | None, key_name: str | None, include_content: bool = False) -> dict:
    item = {
        "id": log.id,
        "created_at": log.created_at.isoformat(),
        "application_id": str(log.application_id) if log.application_id else None,
        "application_name": app_name or ("Key heredada (.env)" if log.key_prefix == "legacy" else None),
        "api_key_id": str(log.api_key_id) if log.api_key_id else None,
        "api_key_name": key_name,
        "key_prefix": log.key_prefix,
        "endpoint": log.endpoint,
        "method": log.method,
        "model": log.model,
        "prompt_tokens": log.prompt_tokens,
        "completion_tokens": log.completion_tokens,
        "total_tokens": log.total_tokens,
        "processing_ms": log.processing_ms,
        "status_code": log.status_code,
        "status": log.status,
        "error": log.error,
        "client_ip": log.client_ip,
    }
    if include_content:
        item["request_content"] = log.request_content
        item["response_content"] = log.response_content
    return item


@router.get("")
def list_logs(
    application_id: uuid.UUID | None = None,
    api_key_id: uuid.UUID | None = None,
    model: str | None = Query(default=None, max_length=120),
    endpoint: str | None = Query(default=None, max_length=64),
    status: Literal["success", "error"] | None = None,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_admin_db),
    _: AdminContext = Depends(current_admin),
):
    tz = ZoneInfo(get_settings().dashboard_timezone)
    filters = []
    if application_id:
        filters.append(ApiRequestLog.application_id == application_id)
    if api_key_id:
        filters.append(ApiRequestLog.api_key_id == api_key_id)
    if model:
        filters.append(ApiRequestLog.model == model)
    if endpoint:
        filters.append(ApiRequestLog.endpoint == endpoint)
    if status:
        filters.append(ApiRequestLog.status == status)
    if date_from:
        filters.append(ApiRequestLog.created_at >= datetime.combine(date_from, time.min, tz))
    if date_to:
        filters.append(ApiRequestLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tz))

    total = db.scalar(select(func.count(ApiRequestLog.id)).where(*filters)) or 0
    rows = db.execute(
        select(ApiRequestLog, Application.name, ApiKey.name)
        .outerjoin(Application, ApiRequestLog.application_id == Application.id)
        .outerjoin(ApiKey, ApiRequestLog.api_key_id == ApiKey.id)
        .where(*filters)
        .order_by(ApiRequestLog.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [serialize_log(log, app_name, key_name) for log, app_name, key_name in rows],
    }


@router.get("/facets")
def log_facets(db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    """Valores disponibles para los filtros."""
    models = [m for (m,) in db.execute(select(ApiRequestLog.model).where(ApiRequestLog.model.is_not(None)).distinct()) if m]
    endpoints = [e for (e,) in db.execute(select(ApiRequestLog.endpoint).distinct())]
    return {"models": sorted(models), "endpoints": sorted(endpoints)}


@router.get("/{log_id}")
def get_log(log_id: int, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    row = db.execute(
        select(ApiRequestLog, Application.name, ApiKey.name)
        .outerjoin(Application, ApiRequestLog.application_id == Application.id)
        .outerjoin(ApiKey, ApiRequestLog.api_key_id == ApiKey.id)
        .where(ApiRequestLog.id == log_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Log no encontrado")
    log, app_name, key_name = row
    return serialize_log(log, app_name, key_name, include_content=True)
