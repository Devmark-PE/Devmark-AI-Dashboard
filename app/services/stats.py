"""Agregaciones de uso para el dashboard.

Se agregan en Python para funcionar igual en PostgreSQL y en SQLite (tests).
Con el volumen actual es de sobra; cuando crezca, se añade una tabla de uso
diaria precalculada sin cambiar la API del dashboard.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import ApiRequestLog, Application

MAX_CUSTOM_DAYS = 92


@dataclass
class Range:
    start: datetime  # UTC
    end: datetime  # UTC
    granularity: str  # hour | day
    tz: ZoneInfo


def resolve_range(name: str, tz_name: str, date_from: date | None = None, date_to: date | None = None) -> Range:
    tz = ZoneInfo(tz_name)
    now_local = utcnow().astimezone(tz)
    today = now_local.date()

    if name == "today":
        start_local = datetime.combine(today, time.min, tz)
        end_local = start_local + timedelta(days=1)
        granularity = "hour"
    elif name in ("7d", "30d"):
        days = 7 if name == "7d" else 30
        start_local = datetime.combine(today - timedelta(days=days - 1), time.min, tz)
        end_local = datetime.combine(today + timedelta(days=1), time.min, tz)
        granularity = "day"
    elif name == "custom":
        if date_from is None or date_to is None:
            raise ValueError("Rango personalizado requiere 'from' y 'to'")
        if date_to < date_from:
            raise ValueError("'to' debe ser posterior a 'from'")
        if (date_to - date_from).days + 1 > MAX_CUSTOM_DAYS:
            raise ValueError(f"El rango máximo es de {MAX_CUSTOM_DAYS} días")
        start_local = datetime.combine(date_from, time.min, tz)
        end_local = datetime.combine(date_to + timedelta(days=1), time.min, tz)
        granularity = "hour" if date_from == date_to else "day"
    else:
        raise ValueError("Rango inválido")

    return Range(
        start=start_local.astimezone(timezone.utc),
        end=end_local.astimezone(timezone.utc),
        granularity=granularity,
        tz=tz,
    )


def _bucket_keys(r: Range) -> list[datetime]:
    step = timedelta(hours=1) if r.granularity == "hour" else timedelta(days=1)
    keys = []
    cursor = r.start.astimezone(r.tz)
    end = r.end.astimezone(r.tz)
    while cursor < end:
        keys.append(cursor)
        # Avanza en hora local (evita desfases si hubiera cambio de horario).
        cursor = (cursor + step).astimezone(r.tz)
    return keys


def _bucket_of(created_at: datetime, r: Range) -> datetime:
    local = created_at.astimezone(r.tz)
    if r.granularity == "hour":
        return local.replace(minute=0, second=0, microsecond=0)
    return datetime.combine(local.date(), time.min, r.tz)


def _empty() -> dict:
    return {"requests": 0, "errors": 0, "tokens": 0, "prompt_tokens": 0, "completion_tokens": 0, "latency_sum": 0}


def _finish(acc: dict) -> dict:
    requests = acc["requests"]
    return {
        "requests": requests,
        "errors": acc["errors"],
        "tokens": acc["tokens"],
        "prompt_tokens": acc["prompt_tokens"],
        "completion_tokens": acc["completion_tokens"],
        "avg_latency_ms": round(acc["latency_sum"] / requests) if requests else 0,
        "error_rate": round(acc["errors"] / requests, 4) if requests else 0.0,
    }


def _add(acc: dict, row) -> None:
    acc["requests"] += 1
    acc["errors"] += 1 if row.status == "error" else 0
    acc["tokens"] += row.total_tokens or 0
    acc["prompt_tokens"] += row.prompt_tokens or 0
    acc["completion_tokens"] += row.completion_tokens or 0
    acc["latency_sum"] += row.processing_ms or 0


def usage(db: Session, r: Range, application_id: uuid.UUID | None = None) -> dict:
    query = select(
        ApiRequestLog.created_at,
        ApiRequestLog.application_id,
        ApiRequestLog.model,
        ApiRequestLog.status,
        ApiRequestLog.total_tokens,
        ApiRequestLog.prompt_tokens,
        ApiRequestLog.completion_tokens,
        ApiRequestLog.processing_ms,
    ).where(ApiRequestLog.created_at >= r.start, ApiRequestLog.created_at < r.end)
    if application_id is not None:
        query = query.where(ApiRequestLog.application_id == application_id)

    totals = _empty()
    buckets: dict[datetime, dict] = {key: _empty() for key in _bucket_keys(r)}
    by_app: dict[uuid.UUID | None, dict] = defaultdict(_empty)
    by_model: dict[str | None, dict] = defaultdict(_empty)

    for row in db.execute(query):
        created = row.created_at if row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
        _add(totals, row)
        bucket = buckets.get(_bucket_of(created, r))
        if bucket is not None:
            _add(bucket, row)
        _add(by_app[row.application_id], row)
        _add(by_model[row.model], row)

    app_names = {
        app_id: name
        for app_id, name in db.execute(
            select(Application.id, Application.name).where(Application.id.in_([k for k in by_app if k]))
        )
    } if any(by_app) else {}

    return {
        "range": {
            "start": r.start.isoformat(),
            "end": r.end.isoformat(),
            "granularity": r.granularity,
            "timezone": str(r.tz),
        },
        "totals": _finish(totals),
        "series": [{"bucket": key.isoformat(), **_finish(acc)} for key, acc in buckets.items()],
        "by_application": sorted(
            (
                {
                    "application_id": str(app_id) if app_id else None,
                    "name": app_names.get(app_id, "Key heredada (.env)" if app_id is None else "Eliminada"),
                    **_finish(acc),
                }
                for app_id, acc in by_app.items()
            ),
            key=lambda item: item["requests"],
            reverse=True,
        ),
        "by_model": sorted(
            ({"model": model or "—", **_finish(acc)} for model, acc in by_model.items()),
            key=lambda item: item["requests"],
            reverse=True,
        ),
    }


def total_requests(db: Session) -> int:
    return db.scalar(select(func.count(ApiRequestLog.id))) or 0
