"""2FA (TOTP), códigos de recuperación, 'mantener sesión' y recuperación de contraseña."""

import time

import pytest

from app.database import session_scope
from app.models import PasswordResetToken, User
from app.services import emails, mailer, totp
from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_totp_rfc6238_vector():
    # RFC 6238, apéndice B (SHA1): T=59 → 94287082 (8 dígitos); con 6 dígitos → 287082
    secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # "12345678901234567890" en base32
    assert totp._code(secret, 59 // 30) == "287082"
    assert totp.verify(secret, "287082", now=59) == 1
    assert totp.verify(secret, "287082", last_step=1, now=59) is None  # anti-replay
    assert totp.verify(secret, "000000", now=59) is None


def code_now(secret: str) -> str:
    return totp._code(secret, totp.current_step())


def enable_2fa(client, csrf):
    setup = client.post("/api/admin/auth/2fa/setup", headers=csrf).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/Devmark%20AI:")
    r = client.post("/api/admin/auth/2fa/enable", json={"code": code_now(setup["secret"])}, headers=csrf)
    assert r.status_code == 200, r.text
    return setup["secret"], r.json()["recovery_codes"]


def test_enable_2fa_and_login_flow(admin):
    client, csrf = admin
    assert client.post("/api/admin/auth/2fa/enable", json={"code": "123456"}, headers=csrf).status_code == 400  # sin setup
    secret, codes = enable_2fa(client, csrf)
    assert len(codes) == 10 and client.get("/api/admin/auth/me").json()["user"]["totp_enabled"] is True
    with session_scope() as db:
        user = db.query(User).filter_by(email=ADMIN_EMAIL).one()
        assert codes[0] not in user.recovery_codes  # solo se guardan hashes

    client.cookies.clear()
    r = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200 and r.json()["mfa_required"] is True and "set-cookie" not in r.headers
    token = r.json()["mfa_token"]
    assert client.get("/api/admin/auth/me").status_code == 401  # aún sin sesión

    assert client.post("/api/admin/auth/login/2fa", json={"mfa_token": token, "code": "000000"}).status_code == 401
    # El código del paso ya usado al activar no sirve (anti-replay); se simula el siguiente paso.
    next_code = totp._code(secret, totp.current_step() + 1)
    r = client.post("/api/admin/auth/login/2fa", json={"mfa_token": token, "code": next_code})
    assert r.status_code == 200 and client.get("/api/admin/auth/me").status_code == 200


def test_recovery_code_single_use(admin):
    client, csrf = admin
    _, codes = enable_2fa(client, csrf)
    client.cookies.clear()
    token = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()["mfa_token"]
    assert client.post("/api/admin/auth/login/2fa", json={"mfa_token": token, "recovery_code": codes[0].upper()}).status_code == 200
    assert client.get("/api/admin/auth/2fa").json()["recovery_codes_remaining"] == 9
    client.cookies.clear()
    token = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()["mfa_token"]
    assert client.post("/api/admin/auth/login/2fa", json={"mfa_token": token, "recovery_code": codes[0]}).status_code == 401


def test_mfa_token_tampering_and_expiry(admin, monkeypatch):
    client, csrf = admin
    enable_2fa(client, csrf)
    client.cookies.clear()
    token = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).json()["mfa_token"]
    assert client.post("/api/admin/auth/login/2fa", json={"mfa_token": token[:-4] + "AAAA", "code": "123456"}).status_code == 401
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + 600)
    assert client.post("/api/admin/auth/login/2fa", json={"mfa_token": token, "code": "123456"}).status_code == 401


def test_disable_and_regenerate_require_password_and_code(admin):
    client, csrf = admin
    secret, codes = enable_2fa(client, csrf)
    r = client.post("/api/admin/auth/2fa/recovery-codes", json={"password": "incorrecta-123", "recovery_code": codes[1]}, headers=csrf)
    assert r.status_code == 400
    r = client.post("/api/admin/auth/2fa/recovery-codes", json={"password": ADMIN_PASSWORD, "recovery_code": codes[1]}, headers=csrf)
    assert r.status_code == 200 and len(r.json()["recovery_codes"]) == 10
    r = client.post("/api/admin/auth/2fa/disable", json={"password": ADMIN_PASSWORD, "recovery_code": r.json()["recovery_codes"][0]}, headers=csrf)
    assert r.status_code == 200 and client.get("/api/admin/auth/2fa").json()["enabled"] is False
    client.cookies.clear()
    r = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert "mfa_required" not in r.json()


def test_remember_me_cookie(client):
    with session_scope() as db:
        from app.services.passwords import hash_password

        db.add(User(email="r@devmark.test", name="R", password_hash=hash_password(ADMIN_PASSWORD)))
        db.commit()
    short = client.post("/api/admin/auth/login", json={"email": "r@devmark.test", "password": ADMIN_PASSWORD})
    assert "max-age" not in short.headers["set-cookie"].lower()  # cookie de sesión del navegador
    client.cookies.clear()
    long = client.post("/api/admin/auth/login", json={"email": "r@devmark.test", "password": ADMIN_PASSWORD, "remember": True})
    assert "max-age=2592000" in long.headers["set-cookie"].lower()


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(mailer, "is_configured", lambda: True)
    monkeypatch.setattr(
        mailer, "send", lambda to, subject, text, html=None: sent.append({"to": to, "subject": subject, "text": text, "html": html}) or True
    )
    return sent


def test_forgot_and_reset_password(admin, outbox):
    client, csrf = admin
    client.cookies.clear()
    assert client.get("/api/admin/auth/options").json() == {"password_reset_email": True}
    # Email inexistente: misma respuesta, no se envía nada
    assert client.post("/api/admin/auth/password/forgot", json={"email": "nadie@devmark.test"}).json() == {"email_configured": True}
    assert outbox == []
    client.post("/api/admin/auth/password/forgot", json={"email": ADMIN_EMAIL})
    assert len(outbox) == 1 and outbox[0]["to"] == ADMIN_EMAIL
    token = outbox[0]["text"].split("token=")[1].split()[0]
    with session_scope() as db:
        assert db.query(PasswordResetToken).one().token_hash != token  # solo el hash

    assert client.post("/api/admin/auth/password/reset", json={"token": token, "new_password": "corta"}).status_code == 422
    assert client.post("/api/admin/auth/password/reset", json={"token": token, "new_password": "nueva-clave-segura-9"}).status_code == 204
    assert client.post("/api/admin/auth/password/reset", json={"token": token, "new_password": "otra-clave-segura-9"}).status_code == 400  # un solo uso
    assert client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).status_code == 401
    assert client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": "nueva-clave-segura-9"}).status_code == 200


def test_reset_invalidates_sessions_and_expired_tokens(admin, outbox):
    client, csrf = admin
    client.post("/api/admin/auth/password/forgot", json={"email": ADMIN_EMAIL})
    token = outbox[0]["text"].split("token=")[1].split()[0]
    with session_scope() as db:
        record = db.query(PasswordResetToken).one()
        from datetime import datetime, timedelta, timezone

        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert client.post("/api/admin/auth/password/reset", json={"token": token, "new_password": "nueva-clave-segura-9"}).status_code == 400
    # Un token válido cierra la sesión abierta
    client.post("/api/admin/auth/password/forgot", json={"email": ADMIN_EMAIL})
    token = outbox[1]["text"].split("token=")[1].split()[0]
    client.post("/api/admin/auth/password/reset", json={"token": token, "new_password": "nueva-clave-segura-9"})
    assert client.get("/api/admin/auth/me").status_code == 401


def test_forgot_without_smtp(client):
    assert client.get("/api/admin/auth/options").json() == {"password_reset_email": False}
    assert client.post("/api/admin/auth/password/forgot", json={"email": ADMIN_EMAIL}).json() == {"email_configured": False}


def test_security_notifications(admin, outbox):
    client, csrf = admin
    secret, _ = enable_2fa(client, csrf)
    assert [m["subject"] for m in outbox] == ["Verificación en dos pasos activada en DEVMARK AI"]
    codes = client.post("/api/admin/auth/2fa/recovery-codes", json={"password": ADMIN_PASSWORD, "code": None, "recovery_code": None}, headers=csrf)
    assert codes.status_code in (400, 422)  # sin segundo factor no se regenera ni se notifica
    assert len(outbox) == 1
    r = client.post("/api/admin/settings/password", json={"current_password": ADMIN_PASSWORD, "new_password": "otra-clave-segura-9"}, headers=csrf)
    assert r.status_code == 204
    changed = outbox[-1]
    assert changed["to"] == ADMIN_EMAIL and "se cambió" in changed["subject"]
    assert "Dirección IP" in changed["text"] and "Tarazona" not in changed["html"]
    for m in outbox:  # nunca se envían secretos
        assert secret not in m["text"] and secret not in m["html"] and "otra-clave-segura-9" not in m["html"]


def test_email_template_escapes_and_has_text_version():
    msg = emails.password_reset("<script>alert(1)</script>", "https://ai.example/reset?token=a&b=1", 30)
    assert "<script>" not in msg.html and "&lt;script&gt;" in msg.html
    assert "token=a&amp;b=1" in msg.html
    assert "https://ai.example/reset?token=a&b=1" in msg.text and "30 minutos" in msg.text
    assert msg.html.startswith("<!doctype html>") and "DEV<span" in msg.html


def test_reset_sends_password_changed_notice(admin, outbox):
    client, csrf = admin
    client.post("/api/admin/auth/password/forgot", json={"email": ADMIN_EMAIL})
    token = outbox[0]["text"].split("token=")[1].split()[0]
    assert client.post("/api/admin/auth/password/reset", json={"token": token, "new_password": "nueva-clave-segura-9"}).status_code == 204
    assert [m["subject"] for m in outbox] == ["Restablece tu contraseña de DEVMARK AI", "Tu contraseña de DEVMARK AI se cambió"]
