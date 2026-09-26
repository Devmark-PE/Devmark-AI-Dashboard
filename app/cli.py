"""Comandos de administración.

    python -m app.cli generate-secret
    python -m app.cli setup-env            # configura DATABASE_URL y API_KEY_PEPPER en .env
    python -m app.cli check-db             # prueba la conexión a la base de datos
    python -m app.cli create-admin --email tu@correo.com --name "Tu Nombre"
    python -m app.cli reset-password --email tu@correo.com
    python -m app.cli list-admins
"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import secrets
import stat
import sys
from urllib.parse import quote

from sqlalchemy import select


def _ask_password() -> str:
    from app.services.passwords import validate_password_strength

    env_password = os.getenv("DEVMARK_ADMIN_PASSWORD")
    if env_password:
        password = env_password
    else:
        password = getpass.getpass("Contraseña (mín. 12 caracteres): ")
        if password != getpass.getpass("Repite la contraseña: "):
            sys.exit("Las contraseñas no coinciden")
    problem = validate_password_strength(password)
    if problem:
        sys.exit(problem)
    return password


ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")


def _read_env_keys(path: str) -> set[str]:
    if not os.path.exists(path):
        return set()
    with open(path) as fh:
        return {line.split("=", 1)[0].strip() for line in fh if "=" in line and not line.lstrip().startswith("#")}


def _test_connection(url: str) -> str:
    from sqlalchemy import create_engine, text

    engine = create_engine(url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT version()")).scalar() or ""
    finally:
        engine.dispose()


def setup_env() -> None:
    """Asistente: pide los datos del pooler de Supabase (o de un PostgreSQL propio),
    prueba la conexión y añade DATABASE_URL + API_KEY_PEPPER al .env sin mostrarlos."""
    existing = _read_env_keys(ENV_PATH)
    print(f"Archivo: {ENV_PATH}")
    if "DATABASE_URL" in existing:
        sys.exit("DATABASE_URL ya existe en .env. Edítalo a mano si quieres cambiarlo.")

    print("Datos del 'Session pooler' de Supabase (Connect → Session pooler):")
    host = input("  Host (p. ej. aws-0-us-east-1.pooler.supabase.com): ").strip()
    port = input("  Puerto [5432]: ").strip() or "5432"
    user = input("  Usuario (p. ej. postgres.wgmdzfuvgkhyrlxlxckt): ").strip()
    database = input("  Base de datos [postgres]: ").strip() or "postgres"
    password = getpass.getpass("  Contraseña (no se mostrará): ")
    if not (host and user and password and re.fullmatch(r"\d+", port)):
        sys.exit("Faltan datos")

    url = f"postgresql+psycopg://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}/{quote(database, safe='')}?sslmode=require"
    print("Probando conexión…")
    try:
        version = _test_connection(url)
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"No se pudo conectar: {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
    print(f"  OK: {version.split(' on ')[0]}")

    lines = [f"DATABASE_URL={url}"]
    if "API_KEY_PEPPER" not in existing:
        lines.append(f"API_KEY_PEPPER={secrets.token_urlsafe(48)}")
    with open(ENV_PATH, "a") as fh:
        fh.write("\n# --- Devmark AI: base de datos (añadido por app.cli setup-env) ---\n" + "\n".join(lines) + "\n")
    os.chmod(ENV_PATH, stat.S_IRUSR | stat.S_IWUSR)
    print(f"Añadido a .env: {', '.join(line.split('=', 1)[0] for line in lines)} (permisos 600)")
    print("IMPORTANTE: guarda una copia de API_KEY_PEPPER fuera del servidor. Si se pierde, todas las API keys dejan de funcionar.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate-secret", help="Genera un valor aleatorio para API_KEY_PEPPER")
    sub.add_parser("setup-env", help="Configura DATABASE_URL y API_KEY_PEPPER en .env")
    sub.add_parser("check-db", help="Prueba la conexión a la base de datos")
    create = sub.add_parser("create-admin", help="Crea un administrador del dashboard")
    create.add_argument("--email", required=True)
    create.add_argument("--name", default="")
    reset = sub.add_parser("reset-password", help="Cambia la contraseña de un administrador")
    reset.add_argument("--email", required=True)
    sub.add_parser("list-admins", help="Lista los administradores")
    args = parser.parse_args(argv)

    if args.command == "generate-secret":
        print(secrets.token_urlsafe(48))
        return
    if args.command == "setup-env":
        setup_env()
        return
    if args.command == "check-db":
        from app.config import load_settings

        url = load_settings().database_url
        if not url:
            sys.exit("DATABASE_URL no está configurada")
        try:
            print("OK:", _test_connection(url).split(" on ")[0])
        except Exception as exc:  # noqa: BLE001
            sys.exit(f"No se pudo conectar: {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
        return

    from app.database import session_scope
    from app.models import AdminSession, User
    from app.schemas.admin import normalize_email
    from app.services.passwords import hash_password

    with session_scope() as db:
        if args.command == "list-admins":
            for user in db.scalars(select(User).order_by(User.created_at)):
                state = "activo" if user.is_active else "inactivo"
                print(f"{user.email}\t{user.name}\t{state}\túltimo login: {user.last_login_at or 'nunca'}")
            return

        try:
            email = normalize_email(args.email)
        except ValueError as exc:
            sys.exit(str(exc))
        user = db.scalar(select(User).where(User.email == email))

        if args.command == "create-admin":
            if user:
                sys.exit("Ya existe un administrador con ese email")
            db.add(User(email=email, name=args.name.strip(), password_hash=hash_password(_ask_password())))
            db.commit()
            print(f"Administrador creado: {email}")
        elif args.command == "reset-password":
            if not user:
                sys.exit("No existe un administrador con ese email")
            user.password_hash = hash_password(_ask_password())
            db.query(AdminSession).filter(AdminSession.user_id == user.id).delete()
            db.commit()
            print(f"Contraseña actualizada y sesiones cerradas: {email}")


if __name__ == "__main__":
    main()
