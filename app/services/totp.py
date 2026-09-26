"""TOTP (RFC 6238) con la biblioteca estándar: compatible con Google Authenticator, Authy, 1Password…"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

PERIOD = 30
DIGITS = 6
# Acepta el código anterior y el siguiente (±30 s) por desfase de reloj.
WINDOW = 1
ISSUER = "Devmark AI"


def generate_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_step(now: float | None = None) -> int:
    return int((now if now is not None else time.time()) // PERIOD)


def verify(secret: str, code: str, last_step: int | None = None, now: float | None = None) -> int | None:
    """Devuelve el paso de tiempo aceptado, o None. Rechaza pasos ya usados (anti-replay)."""
    code = "".join(ch for ch in code if ch.isdigit())
    if len(code) != DIGITS:
        return None
    step = current_step(now)
    for candidate in range(step - WINDOW, step + WINDOW + 1):
        if last_step is not None and candidate <= last_step:
            continue
        if hmac.compare_digest(_code(secret, candidate), code):
            return candidate
    return None


def provisioning_uri(secret: str, account: str) -> str:
    label = quote(f"{ISSUER}:{account}", safe=":@")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={PERIOD}"


# --- Códigos de recuperación ---

RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def generate_recovery_codes(count: int = 10) -> list[str]:
    def one() -> str:
        raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(10))
        return f"{raw[:5]}-{raw[5:]}"

    return [one() for _ in range(count)]


def hash_recovery_code(code: str) -> str:
    normalized = "".join(ch for ch in code.lower() if ch.isalnum())
    return hashlib.sha256(normalized.encode()).hexdigest()
