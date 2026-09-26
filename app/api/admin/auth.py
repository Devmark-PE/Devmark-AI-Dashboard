from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, client_ip, current_admin, get_admin_db
from app.config import get_settings
from app.database import utcnow
from app.models import User
from app.schemas.admin import LoginRequest, MeOut, UserOut
from app.services import passwords, sessions

router = APIRouter(prefix="/auth", tags=["admin:auth"])


def _me(ctx_user: User, csrf: str, expires_at) -> MeOut:
    return MeOut(
        user=UserOut(id=ctx_user.id, email=ctx_user.email, name=ctx_user.name, last_login_at=ctx_user.last_login_at),
        csrf_token=csrf,
        session_expires_at=expires_at,
    )


@router.post("/login", response_model=MeOut)
async def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_admin_db)):
    ip = client_ip(request) or "unknown"
    throttle_key = f"{ip}|{body.email}"
    if sessions.login_blocked(throttle_key) or sessions.login_blocked(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")

    user = db.scalar(select(User).where(User.email == body.email))
    # scrypt es costoso: se ejecuta fuera del event loop.
    valid = await run_in_threadpool(
        passwords.verify_password, body.password, user.password_hash if user else passwords.DUMMY_HASH
    )
    if not user or not valid or not user.is_active:
        sessions.register_failure(throttle_key)
        sessions.register_failure(ip)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")

    sessions.clear_failures(throttle_key)
    token, session = sessions.create_session(db, user, ip, request.headers.get("user-agent"))
    user.last_login_at = utcnow()
    db.commit()

    settings = get_settings()
    response.set_cookie(
        sessions.SESSION_COOKIE,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return _me(user, session.csrf_token, session.expires_at)


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    sessions.delete_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    response = Response(status_code=204)
    response.delete_cookie(sessions.SESSION_COOKIE, path="/")
    return response


@router.get("/me", response_model=MeOut)
def me(ctx: AdminContext = Depends(current_admin)):
    return _me(ctx.user, ctx.session.csrf_token, ctx.session.expires_at)
