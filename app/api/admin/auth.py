"""Autenticación del dashboard: login (con 2FA opcional), sesión, 2FA y recuperación de contraseña."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, client_ip, current_admin, get_admin_db
from app.config import get_settings
from app.database import utcnow
from app.models import AdminSession, PasswordResetToken, User
from app.schemas.admin import (
    ForgotPasswordRequest,
    LoginMfaRequest,
    LoginRequest,
    MeOut,
    ResetPasswordRequest,
    TotpCode,
    TotpConfirm,
    UserOut,
    normalize_email,
)
from app.services import emails, mailer, passwords, sessions, totp

router = APIRouter(prefix="/auth", tags=["admin:auth"])

MFA_TOKEN_TTL = 300  # 5 minutos para introducir el código
RESET_TOKEN_TTL = timedelta(minutes=30)


def notify(background: BackgroundTasks, user: User, email: emails.Email) -> None:
    """Envía un aviso de cuenta después de responder (no retrasa la petición). Sin SMTP no hace nada."""
    if mailer.is_configured():
        background.add_task(mailer.send, user.email, email.subject, email.text, email.html)


def _me(user: User, csrf: str, expires_at) -> MeOut:
    return MeOut(
        user=UserOut(id=user.id, email=user.email, name=user.name, last_login_at=user.last_login_at, totp_enabled=bool(user.totp_enabled)),
        csrf_token=csrf,
        session_expires_at=expires_at,
    )


def _start_session(db: Session, user: User, request: Request, response: Response, remember: bool) -> MeOut:
    ip = client_ip(request)
    token, session = sessions.create_session(db, user, ip, request.headers.get("user-agent"), remember=remember)
    user.last_login_at = utcnow()
    db.commit()
    settings = get_settings()
    response.set_cookie(
        sessions.SESSION_COOKIE,
        token,
        # Sin "mantener sesión": cookie de sesión del navegador (se borra al cerrarlo), además de caducar en el servidor.
        max_age=settings.remember_ttl_days * 86400 if remember else None,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return _me(user, session.csrf_token, session.expires_at)


# ---------------------------------------------------------------------------
# Token intermedio de 2FA (sin estado): HMAC(pepper) sobre usuario + caducidad
# ---------------------------------------------------------------------------

def _mfa_key() -> bytes:
    return hashlib.sha256(b"devmark-mfa|" + (get_settings().api_key_pepper or "").encode()).digest()


def _password_fingerprint(user: User) -> str:
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def _issue_mfa_token(user: User, remember: bool) -> str:
    payload = f"{user.id}|{int(time.time()) + MFA_TOKEN_TTL}|{int(remember)}|{_password_fingerprint(user)}|{secrets.token_hex(4)}"
    signature = hmac.new(_mfa_key(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{signature}".encode()).decode()


def _read_mfa_token(db: Session, token: str) -> tuple[User, bool]:
    invalid = HTTPException(status_code=401, detail="La verificación expiró. Vuelve a iniciar sesión.")
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        user_id, expires, remember, fingerprint, nonce, signature = raw.split("|")
    except (ValueError, UnicodeDecodeError):
        raise invalid from None
    payload = "|".join([user_id, expires, remember, fingerprint, nonce])
    expected = hmac.new(_mfa_key(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected) or int(expires) < time.time():
        raise invalid
    user = db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active or not user.totp_enabled or _password_fingerprint(user) != fingerprint:
        raise invalid
    return user, remember == "1"


def _consume_second_factor(db: Session, user: User, code: str | None, recovery_code: str | None) -> bool:
    """Valida un código TOTP (anti-replay) o consume un código de recuperación."""
    if code and user.totp_secret:
        step = totp.verify(user.totp_secret, code, user.totp_last_step)
        if step is not None:
            user.totp_last_step = step
            return True
    if recovery_code and user.recovery_codes:
        digest = totp.hash_recovery_code(recovery_code)
        if digest in user.recovery_codes:
            user.recovery_codes = [c for c in user.recovery_codes if c != digest]
            return True
    return False


# ---------------------------------------------------------------------------
# Login / logout / sesión
# ---------------------------------------------------------------------------

@router.post("/login")
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
    if user.totp_enabled:
        return {"mfa_required": True, "mfa_token": _issue_mfa_token(user, body.remember)}
    return _start_session(db, user, request, response, body.remember)


@router.post("/login/2fa", response_model=MeOut)
def login_2fa(body: LoginMfaRequest, request: Request, response: Response, db: Session = Depends(get_admin_db)):
    ip = client_ip(request) or "unknown"
    user, remember = _read_mfa_token(db, body.mfa_token)
    throttle_key = f"mfa|{user.id}"
    if sessions.login_blocked(throttle_key) or sessions.login_blocked(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")
    if not _consume_second_factor(db, user, body.code, body.recovery_code):
        sessions.register_failure(throttle_key)
        sessions.register_failure(ip)
        raise HTTPException(status_code=401, detail="Código incorrecto")
    sessions.clear_failures(throttle_key)
    return _start_session(db, user, request, response, remember)


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    sessions.delete_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    response = Response(status_code=204)
    response.delete_cookie(sessions.SESSION_COOKIE, path="/")
    return response


@router.get("/me", response_model=MeOut)
def me(ctx: AdminContext = Depends(current_admin)):
    return _me(ctx.user, ctx.session.csrf_token, ctx.session.expires_at)


@router.get("/options")
def auth_options():
    """Opciones públicas para la pantalla de login (sin datos de usuarios)."""
    return {"password_reset_email": mailer.is_configured()}


# ---------------------------------------------------------------------------
# 2FA (TOTP)
# ---------------------------------------------------------------------------

@router.get("/2fa")
def totp_status(ctx: AdminContext = Depends(current_admin)):
    return {"enabled": bool(ctx.user.totp_enabled), "recovery_codes_remaining": len(ctx.user.recovery_codes or [])}


@router.post("/2fa/setup")
def totp_setup(db: Session = Depends(get_admin_db), ctx: AdminContext = Depends(current_admin)):
    if ctx.user.totp_enabled:
        raise HTTPException(status_code=409, detail="La verificación en dos pasos ya está activa")
    secret = totp.generate_secret()
    ctx.user.totp_pending_secret = secret
    db.commit()
    return {"secret": secret, "otpauth_uri": totp.provisioning_uri(secret, ctx.user.email)}


@router.post("/2fa/enable")
def totp_enable(
    body: TotpCode,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_admin_db),
    ctx: AdminContext = Depends(current_admin),
):
    user = ctx.user
    if user.totp_enabled:
        raise HTTPException(status_code=409, detail="La verificación en dos pasos ya está activa")
    if not user.totp_pending_secret:
        raise HTTPException(status_code=400, detail="Primero genera el código QR")
    step = totp.verify(user.totp_pending_secret, body.code)
    if step is None:
        raise HTTPException(status_code=400, detail="Código incorrecto. Revisa la hora del teléfono y vuelve a intentarlo.")
    codes = totp.generate_recovery_codes()
    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    user.totp_enabled = True
    user.totp_last_step = step
    user.recovery_codes = [totp.hash_recovery_code(c) for c in codes]
    # Por seguridad se cierran las demás sesiones abiertas.
    db.execute(delete(AdminSession).where(AdminSession.user_id == user.id, AdminSession.id != ctx.session.id))
    db.commit()
    notify(background, user, emails.two_factor_enabled(user.name or user.email, client_ip(request)))
    return {"enabled": True, "recovery_codes": codes}


async def _confirm_identity(db: Session, user: User, body: TotpConfirm) -> None:
    if not await run_in_threadpool(passwords.verify_password, body.password, user.password_hash):
        raise HTTPException(status_code=400, detail="La contraseña no es correcta")
    if not _consume_second_factor(db, user, body.code, body.recovery_code):
        raise HTTPException(status_code=400, detail="Código incorrecto")


@router.post("/2fa/disable")
async def totp_disable(
    body: TotpConfirm,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_admin_db),
    ctx: AdminContext = Depends(current_admin),
):
    if not ctx.user.totp_enabled:
        raise HTTPException(status_code=409, detail="La verificación en dos pasos no está activa")
    await _confirm_identity(db, ctx.user, body)
    ctx.user.totp_enabled = False
    ctx.user.totp_secret = None
    ctx.user.totp_last_step = None
    ctx.user.recovery_codes = None
    db.commit()
    notify(background, ctx.user, emails.two_factor_disabled(ctx.user.name or ctx.user.email, client_ip(request)))
    return {"enabled": False}


@router.post("/2fa/recovery-codes")
async def totp_regenerate_codes(
    body: TotpConfirm,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_admin_db),
    ctx: AdminContext = Depends(current_admin),
):
    if not ctx.user.totp_enabled:
        raise HTTPException(status_code=409, detail="La verificación en dos pasos no está activa")
    await _confirm_identity(db, ctx.user, body)
    codes = totp.generate_recovery_codes()
    ctx.user.recovery_codes = [totp.hash_recovery_code(c) for c in codes]
    db.commit()
    notify(background, ctx.user, emails.recovery_codes_regenerated(ctx.user.name or ctx.user.email, client_ip(request)))
    return {"recovery_codes": codes}


# ---------------------------------------------------------------------------
# Recuperación de contraseña por email
# ---------------------------------------------------------------------------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/password/forgot")
async def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_admin_db)):
    """Siempre responde lo mismo: no revela si el email existe."""
    ip = client_ip(request) or "unknown"
    key = f"forgot|{ip}"
    if sessions.login_blocked(key):
        raise HTTPException(status_code=429, detail="Demasiadas solicitudes. Espera 15 minutos.")
    sessions.register_failure(key)  # cuenta cada solicitud: máx. 5 cada 15 min por IP

    configured = mailer.is_configured()
    try:
        email = normalize_email(body.email)
    except ValueError:
        email = None
    user = db.scalar(select(User).where(User.email == email)) if email and configured else None
    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        now = utcnow()
        db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)))
        db.add(PasswordResetToken(user_id=user.id, token_hash=_hash_token(token), expires_at=now + RESET_TOKEN_TTL, ip=ip))
        db.commit()
        link = f"{get_settings().public_base_url}/dashboard/reset-password/?token={token}"
        email_msg = emails.password_reset(user.name or user.email, link, int(RESET_TOKEN_TTL.total_seconds() // 60))
        await run_in_threadpool(mailer.send, user.email, email_msg.subject, email_msg.text, email_msg.html)
    return {"email_configured": configured}


@router.post("/password/reset", status_code=204)
async def reset_password(
    body: ResetPasswordRequest, request: Request, background: BackgroundTasks, db: Session = Depends(get_admin_db)
):
    ip = client_ip(request) or "unknown"
    key = f"reset|{ip}"
    if sessions.login_blocked(key):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos.")
    problem = passwords.validate_password_strength(body.new_password)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    record = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash_token(body.token)))
    now = utcnow()
    if record is None or record.used_at is not None or record.expires_at <= now:
        sessions.register_failure(key)
        raise HTTPException(status_code=400, detail="El enlace no es válido o ya expiró. Solicita uno nuevo.")
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="El enlace no es válido o ya expiró. Solicita uno nuevo.")
    user.password_hash = await run_in_threadpool(passwords.hash_password, body.new_password)
    record.used_at = now
    # Cierra todas las sesiones y anula otros enlaces pendientes.
    db.execute(delete(AdminSession).where(AdminSession.user_id == user.id))
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.id != record.id))
    db.commit()
    notify(background, user, emails.password_changed(user.name or user.email, ip, via_reset=True))
