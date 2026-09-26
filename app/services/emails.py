"""Correos de DEVMARK AI: plantilla con la marca y mensajes de cuenta/seguridad.

HTML con tablas y estilos en línea (compatible con Gmail, Outlook y móviles) + versión de texto plano.
Todo dato variable se escapa. Ningún correo incluye contraseñas, códigos 2FA ni API keys.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from app.config import get_settings

BRAND = "DEVMARK AI"
ACCENT = "#5b4bdb"
INK = "#0b0b0c"
MUTED = "#6b6a66"
LINE = "#e9e8e4"
BG = "#f4f4f2"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


@dataclass(frozen=True)
class Email:
    subject: str
    text: str
    html: str


def _now_label() -> str:
    tz = get_settings().dashboard_timezone
    try:
        now = datetime.now(ZoneInfo(tz))
    except Exception:  # noqa: BLE001 - zona inválida: UTC
        now = datetime.now(ZoneInfo("UTC"))
        tz = "UTC"
    return f"{now:%d/%m/%Y %H:%M} ({tz})"


def render(
    *,
    subject: str,
    preheader: str,
    title: str,
    greeting: str,
    paragraphs: list[str],
    button: tuple[str, str] | None = None,
    details: list[tuple[str, str]] | None = None,
    tone: str = "info",
    note: str | None = None,
) -> Email:
    """Construye un correo. `paragraphs`, `note` y los valores de `details` son texto plano (se escapan)."""
    base = get_settings().public_base_url
    host = base.split("://", 1)[-1]
    badge_color, badge_bg, badge_text = {
        "info": (ACCENT, "#efedfc", "Cuenta"),
        "security": ("#b42323", "#fdeeee", "Seguridad"),
        "success": ("#006300", "#e8f5e8", "Seguridad"),
    }[tone]

    body = "".join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:{INK}">{escape(p)}</p>' for p in paragraphs
    )
    button_html = ""
    if button:
        label, url = button
        button_html = f"""
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
  <tr><td bgcolor="{ACCENT}" style="border-radius:10px">
    <a href="{escape(url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:{FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">{escape(label)} &rarr;</a>
  </td></tr>
</table>
<p style="margin:0 0 20px;font-size:12px;line-height:18px;color:{MUTED}">¿El botón no funciona? Copia este enlace en tu navegador:<br>
<a href="{escape(url)}" style="color:{ACCENT};word-break:break-all">{escape(url)}</a></p>"""
    details_html = ""
    if details:
        rows = "".join(
            f'<tr><td style="padding:8px 0;font-size:13px;color:{MUTED};width:38%;vertical-align:top">{escape(k)}</td>'
            f'<td style="padding:8px 0;font-size:13px;color:{INK};font-weight:500">{escape(v)}</td></tr>'
            for k, v in details
        )
        details_html = f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border-top:1px solid {LINE};border-bottom:1px solid {LINE}">{rows}</table>"""
    note_html = (
        f'<p style="margin:0;padding:14px 16px;background:{BG};border-radius:10px;font-size:13px;line-height:20px;color:{MUTED}">{escape(note)}</p>'
        if note
        else ""
    )

    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{escape(subject)}</title></head>
<body style="margin:0;padding:0;background:{BG};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{BG}">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:{FONT}">
    <tr><td bgcolor="#0b0b12" style="padding:22px 32px;border-radius:16px 16px 0 0;background:#0b0b12;background-image:linear-gradient(135deg,#0b0b12 0%,#1c1840 100%)">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:30px;height:30px;border-radius:8px;background:{ACCENT};text-align:center;font-size:15px;font-weight:700;color:#ffffff;line-height:30px">D</td>
        <td style="padding-left:10px;font-size:16px;letter-spacing:3px;font-weight:600;color:#ffffff">DEV<span style="color:#a6abb8">MARK</span></td>
        <td style="padding-left:8px"><span style="display:inline-block;padding:2px 6px;border-radius:5px;background:#2a2560;color:#b9b0ff;font-size:10px;font-weight:700;letter-spacing:1px">AI</span></td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="#ffffff" style="padding:32px;border-left:1px solid {LINE};border-right:1px solid {LINE}">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:{badge_bg};color:{badge_color};font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">{badge_text}</span>
      <h1 style="margin:14px 0 18px;font-size:22px;line-height:30px;font-weight:700;color:{INK}">{escape(title)}</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:{INK}">{escape(greeting)}</p>
      {body}{button_html}{details_html}{note_html}
    </td></tr>
    <tr><td style="padding:20px 32px;border:1px solid {LINE};border-top:0;border-radius:0 0 16px 16px;background:#fafaf8">
      <p style="margin:0;font-size:12px;line-height:18px;color:{MUTED}">Correo automático de <b style="color:{INK}">{BRAND}</b> · <a href="{escape(base)}/dashboard/" style="color:{MUTED}">{escape(host)}</a><br>
      No respondas a este mensaje. Nunca te pediremos tu contraseña ni tus códigos por correo.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""

    text_parts = [title, "", greeting, "", *[p + "\n" for p in paragraphs]]
    if button:
        text_parts += [f"{button[0]}: {button[1]}", ""]
    if details:
        text_parts += [f"{k}: {v}" for k, v in details] + [""]
    if note:
        text_parts += [note, ""]
    text_parts += ["—", f"{BRAND} · {host}", "Nunca te pediremos tu contraseña ni tus códigos por correo."]
    return Email(subject=subject, text="\n".join(text_parts), html=html)


# ---------------------------------------------------------------------------
# Mensajes
# ---------------------------------------------------------------------------


def password_reset(name: str, link: str, minutes: int) -> Email:
    return render(
        subject=f"Restablece tu contraseña de {BRAND}",
        preheader=f"Enlace válido {minutes} minutos para crear una contraseña nueva.",
        title="Restablece tu contraseña",
        greeting=f"Hola {name},",
        paragraphs=[f"Recibimos una solicitud para restablecer la contraseña de tu cuenta de {BRAND}. Pulsa el botón para crear una nueva."],
        button=("Crear nueva contraseña", link),
        note=f"El enlace vence en {minutes} minutos y solo se puede usar una vez. Si no fuiste tú, ignora este correo: tu contraseña no cambiará.",
    )


def _security_details(ip: str | None) -> list[tuple[str, str]]:
    return [("Fecha", _now_label()), ("Dirección IP", ip or "desconocida")]


def _not_you(base: str) -> str:
    return (
        "¿No fuiste tú? Cambia tu contraseña de inmediato desde «¿Olvidaste tu contraseña?» en "
        f"{base}/dashboard/login/ y revisa tus sesiones activas en Configuración."
    )


def password_changed(name: str, ip: str | None, via_reset: bool) -> Email:
    base = get_settings().public_base_url
    how = "con un enlace de recuperación" if via_reset else "desde Configuración"
    return render(
        subject=f"Tu contraseña de {BRAND} se cambió",
        preheader="Se cambió la contraseña de tu cuenta.",
        title="Tu contraseña se cambió",
        greeting=f"Hola {name},",
        paragraphs=[
            f"La contraseña de tu cuenta de {BRAND} se cambió {how}. "
            + ("Por seguridad, se cerraron todas las sesiones abiertas." if via_reset else "Por seguridad, se cerraron las demás sesiones abiertas.")
        ],
        details=_security_details(ip),
        tone="security",
        note=_not_you(base),
    )


def two_factor_enabled(name: str, ip: str | None) -> Email:
    return render(
        subject=f"Verificación en dos pasos activada en {BRAND}",
        preheader="Tu cuenta ahora pide un código al iniciar sesión.",
        title="Verificación en dos pasos activada",
        greeting=f"Hola {name},",
        paragraphs=[
            "Tu cuenta ahora pide un código de tu app autenticadora al iniciar sesión.",
            "Guarda tus códigos de recuperación en un lugar seguro: son la única forma de entrar si pierdes el teléfono.",
        ],
        details=_security_details(ip),
        tone="success",
        note=_not_you(get_settings().public_base_url),
    )


def two_factor_disabled(name: str, ip: str | None) -> Email:
    return render(
        subject=f"Verificación en dos pasos desactivada en {BRAND}",
        preheader="Tu cuenta ya no pide código al iniciar sesión.",
        title="Verificación en dos pasos desactivada",
        greeting=f"Hola {name},",
        paragraphs=["Se desactivó la verificación en dos pasos: tu cuenta ya solo pide la contraseña para entrar. Te recomendamos volver a activarla en Configuración."],
        details=_security_details(ip),
        tone="security",
        note=_not_you(get_settings().public_base_url),
    )


def recovery_codes_regenerated(name: str, ip: str | None) -> Email:
    return render(
        subject=f"Nuevos códigos de recuperación en {BRAND}",
        preheader="Se generaron códigos de recuperación nuevos; los anteriores ya no sirven.",
        title="Nuevos códigos de recuperación",
        greeting=f"Hola {name},",
        paragraphs=["Se generaron 10 códigos de recuperación nuevos para tu cuenta. Los anteriores dejaron de funcionar."],
        details=_security_details(ip),
        tone="security",
        note=_not_you(get_settings().public_base_url),
    )
