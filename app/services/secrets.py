"""Cifrado de secretos guardados en la base (p. ej. cabeceras de Tools con API keys de terceros).

Fernet (AES-128-CBC + HMAC-SHA256) con una llave derivada de API_KEY_PEPPER mediante HKDF: la base de datos sola
no basta para leerlos. Si API_KEY_PEPPER cambia, hay que volver a escribir estos secretos.
"""

from __future__ import annotations

import base64
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import get_settings


class SecretError(Exception):
    pass


@lru_cache(maxsize=4)
def _fernet(pepper: str) -> Fernet:
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"devmark-secrets-v1", info=b"tools").derive(pepper.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def _current() -> Fernet:
    pepper = get_settings().api_key_pepper
    if not pepper:
        raise SecretError("API_KEY_PEPPER no está configurado")
    return _fernet(pepper)


def encrypt(value: str) -> str:
    return _current().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _current().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise SecretError("No se pudo descifrar el secreto (¿cambió API_KEY_PEPPER?)") from exc


def preview(value: str) -> str:
    """Pista para el dashboard sin revelar el secreto: '••••1a2b'."""
    return "••••" + value[-4:] if len(value) >= 12 else "••••"
