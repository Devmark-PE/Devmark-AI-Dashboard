"""Compatibilidad: systemd ejecuta `uvicorn main:app`.

Toda la aplicación vive ahora en el paquete app/ (ver app/main.py).
"""

from app.main import app

__all__ = ["app"]
