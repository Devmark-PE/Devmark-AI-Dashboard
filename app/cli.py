"""Comandos de administración.

    python -m app.cli generate-secret
    python -m app.cli create-admin --email tu@correo.com --name "Tu Nombre"
    python -m app.cli reset-password --email tu@correo.com
    python -m app.cli list-admins
"""

from __future__ import annotations

import argparse
import getpass
import os
import secrets
import sys

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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("generate-secret", help="Genera un valor aleatorio para API_KEY_PEPPER")
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
