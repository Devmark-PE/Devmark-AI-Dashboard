"""Bloquea el acceso a las tablas desde la API REST de Supabase (PostgREST).

Supabase expone el esquema public con los roles anon/authenticated. Estas tablas
guardan hashes de API keys y contraseñas, así que:
  - se activa Row Level Security SIN políticas (nadie salvo el dueño puede leer), y
  - se revocan todos los privilegios de anon y authenticated, si existen.
En un PostgreSQL normal (sin esos roles) solo se activa RLS, que no afecta al
dueño de las tablas (el usuario con el que se conecta el backend).

Revision ID: 0002
Revises: 0001
"""
from __future__ import annotations

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

TABLES = ("users", "admin_sessions", "applications", "api_keys", "api_request_logs", "alembic_version")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',
                'users, admin_sessions, applications, api_keys, api_request_logs, alembic_version', r);
              EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
