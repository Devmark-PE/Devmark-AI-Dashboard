from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.config import get_settings
from app.models import AdminSession
from app.schemas.admin import ChangePasswordRequest
from app.services import passwords

router = APIRouter(prefix="/settings", tags=["admin:settings"])


@router.get("")
def get_platform_settings(db: Session = Depends(get_admin_db), ctx: AdminContext = Depends(current_admin)):
    """Configuración efectiva (sin secretos)."""
    s = get_settings()
    active_sessions = db.scalars(
        select(AdminSession).where(AdminSession.user_id == ctx.user.id).order_by(AdminSession.created_at.desc())
    ).all()
    return {
        "public_base_url": s.public_base_url,
        "default_model": s.default_model,
        "allowed_models": s.allowed_models,
        "ollama_max_concurrency": s.ollama_max_concurrency,
        "legacy_api_key_enabled": bool(s.legacy_api_key_enabled and s.legacy_api_key),
        "log_request_content": s.log_request_content,
        "max_messages": s.max_messages,
        "max_input_chars": s.max_input_chars,
        "session_ttl_hours": s.session_ttl_hours,
        "dashboard_timezone": s.dashboard_timezone,
        "sessions": [
            {
                "id": str(item.id),
                "created_at": item.created_at.isoformat(),
                "last_seen_at": item.last_seen_at.isoformat(),
                "expires_at": item.expires_at.isoformat(),
                "ip": item.ip,
                "user_agent": item.user_agent,
                "current": item.id == ctx.session.id,
            }
            for item in active_sessions
        ],
    }


@router.post("/password", status_code=204)
async def change_password(body: ChangePasswordRequest, db: Session = Depends(get_admin_db), ctx: AdminContext = Depends(current_admin)):
    problem = passwords.validate_password_strength(body.new_password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    if not await run_in_threadpool(passwords.verify_password, body.current_password, ctx.user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    ctx.user.password_hash = await run_in_threadpool(passwords.hash_password, body.new_password)
    # Cierra todas las demás sesiones del usuario.
    db.execute(delete(AdminSession).where(AdminSession.user_id == ctx.user.id, AdminSession.id != ctx.session.id))
    db.commit()


@router.post("/sessions/revoke-others", status_code=204)
def revoke_other_sessions(db: Session = Depends(get_admin_db), ctx: AdminContext = Depends(current_admin)):
    db.execute(delete(AdminSession).where(AdminSession.user_id == ctx.user.id, AdminSession.id != ctx.session.id))
    db.commit()
