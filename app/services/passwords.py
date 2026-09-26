"""Hash de contraseñas con scrypt (biblioteca estándar, sin dependencias nativas)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

_N, _R, _P = 2**14, 8, 1  # ~16 MB por verificación
_DKLEN = 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return "scrypt${}${}${}${}${}".format(
        _N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(digest).decode()
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = encoded.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        digest = hashlib.scrypt(
            password.encode(), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# Hash de relleno para que un email inexistente tarde lo mismo que uno válido.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def validate_password_strength(password: str) -> str | None:
    if len(password) < 12:
        return "La contraseña debe tener al menos 12 caracteres"
    if len(password) > 256:
        return "La contraseña es demasiado larga"
    return None
