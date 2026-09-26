"""Envío de emails por SMTP (recuperación de contraseña). Opcional: si no hay SMTP, no se envía nada."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger("devmark.mailer")


def is_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_from)


def send(to: str, subject: str, text: str, html: str | None = None) -> bool:
    s = get_settings()
    if not is_configured():
        return False
    message = EmailMessage()
    message["From"] = s.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    try:
        context = ssl.create_default_context()
        if s.smtp_port == 465:
            with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, context=context, timeout=15) as smtp:
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(message)
        else:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
                smtp.starttls(context=context)
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(message)
        return True
    except Exception:  # noqa: BLE001 - se registra sin exponer credenciales
        logger.exception("No se pudo enviar el email a %s", to)
        return False
