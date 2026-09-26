from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.database import utcnow
from app.models import ApiKey, ApiRequestLog, Application, RagDocument
from app.schemas.admin import ApplicationCreate, ApplicationOut, ApplicationUpdate

router = APIRouter(prefix="/applications", tags=["admin:applications"])


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug[:80] or "app"


def _unique_slug(db: Session, base: str) -> str:
    slug, n = base, 2
    while db.scalar(select(Application.id).where(Application.slug == slug)):
        suffix = f"-{n}"
        slug = f"{base[: 80 - len(suffix)]}{suffix}"
        n += 1
    return slug


def _serialize(db: Session, apps: list[Application]) -> list[ApplicationOut]:
    if not apps:
        return []
    ids = [a.id for a in apps]
    key_stats = {
        row.application_id: row
        for row in db.execute(
            select(
                ApiKey.application_id,
                func.count(ApiKey.id).label("total"),
                func.count(ApiKey.id).filter(ApiKey.status == "active").label("active"),
                func.max(ApiKey.last_used_at).label("last_used"),
            )
            .where(ApiKey.application_id.in_(ids))
            .group_by(ApiKey.application_id)
        )
    }
    since = utcnow() - timedelta(days=30)
    request_counts = dict(
        db.execute(
            select(ApiRequestLog.application_id, func.count(ApiRequestLog.id))
            .where(ApiRequestLog.application_id.in_(ids), ApiRequestLog.created_at >= since)
            .group_by(ApiRequestLog.application_id)
        ).all()
    )
    doc_counts = dict(
        db.execute(
            select(RagDocument.application_id, func.count(RagDocument.id))
            .where(RagDocument.application_id.in_(ids))
            .group_by(RagDocument.application_id)
        ).all()
    )
    out = []
    for app in apps:
        stats = key_stats.get(app.id)
        out.append(
            ApplicationOut(
                id=app.id,
                name=app.name,
                slug=app.slug,
                description=app.description,
                status=app.status,
                rate_limit_rpm=app.rate_limit_rpm,
                monthly_token_quota=app.monthly_token_quota,
                created_at=app.created_at,
                updated_at=app.updated_at,
                key_count=stats.total if stats else 0,
                active_key_count=stats.active if stats else 0,
                last_used_at=stats.last_used if stats else None,
                requests_30d=request_counts.get(app.id, 0),
                rag_enabled=bool(app.rag_enabled),
                rag_top_k=app.rag_top_k or 3,
                document_count=doc_counts.get(app.id, 0),
            )
        )
    return out


def _get(db: Session, app_id: uuid.UUID) -> Application:
    app = db.get(Application, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    return app


@router.get("", response_model=list[ApplicationOut])
def list_applications(db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    apps = list(db.scalars(select(Application).order_by(Application.created_at.desc())))
    return _serialize(db, apps)


@router.post("", response_model=ApplicationOut, status_code=201)
def create_application(body: ApplicationCreate, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    if body.slug:
        if db.scalar(select(Application.id).where(Application.slug == body.slug)):
            raise HTTPException(status_code=409, detail="Ya existe una aplicación con ese slug")
        slug = body.slug
    else:
        slug = _unique_slug(db, slugify(body.name))
    app = Application(
        name=body.name.strip(),
        slug=slug,
        description=body.description.strip(),
        rate_limit_rpm=body.rate_limit_rpm,
        monthly_token_quota=body.monthly_token_quota,
    )
    db.add(app)
    db.commit()
    return _serialize(db, [app])[0]


@router.get("/{app_id}", response_model=ApplicationOut)
def get_application(app_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    return _serialize(db, [_get(db, app_id)])[0]


@router.patch("/{app_id}", response_model=ApplicationOut)
def update_application(
    app_id: uuid.UUID, body: ApplicationUpdate, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)
):
    app = _get(db, app_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in {"name", "description"} and value is not None:
            value = value.strip()
        if field in {"name", "status", "rag_enabled", "rag_top_k"} and value is None:
            continue
        setattr(app, field, value)
    db.commit()
    return _serialize(db, [app])[0]


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    app = _get(db, app_id)
    if db.scalar(select(func.count(ApiKey.id)).where(ApiKey.application_id == app.id)):
        raise HTTPException(status_code=409, detail="Elimina primero las API keys de esta aplicación (o deshabilítala)")
    # Los documentos RAG de la aplicación se eliminan con ella (ON DELETE CASCADE).
    for document in db.scalars(select(RagDocument).where(RagDocument.application_id == app.id)):
        db.delete(document)
    db.delete(app)
    db.commit()
