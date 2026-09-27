"""Estado global de la plataforma (modo reposo de la IA).

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-27 12:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('platform_state',
    sa.Column('key', sa.String(length=64), nullable=False),
    sa.Column('value', sa.JSON(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    # Mismas protecciones que 0002: RLS sin políticas y sin privilegios para anon/authenticated (Supabase).
    op.execute('ALTER TABLE "platform_state" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE platform_state FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_table('platform_state')
