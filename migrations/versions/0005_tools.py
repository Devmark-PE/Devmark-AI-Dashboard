"""Tools (function calling): herramientas configurables y su asignación a aplicaciones.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-27 10:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('tools',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=48), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('method', sa.String(length=8), nullable=False),
    sa.Column('url_template', sa.Text(), nullable=False),
    sa.Column('body_template', sa.Text(), nullable=True),
    sa.Column('headers', sa.JSON(), nullable=False),
    sa.Column('parameters', sa.JSON(), nullable=False),
    sa.Column('response_path', sa.String(length=200), nullable=True),
    sa.Column('max_chars', sa.Integer(), server_default='1500', nullable=False),
    sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_tools_name'), 'tools', ['name'], unique=True)
    op.create_table('application_tools',
    sa.Column('application_id', sa.Uuid(), nullable=False),
    sa.Column('tool_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tool_id'], ['tools.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('application_id', 'tool_id')
    )

    # Mismas protecciones que 0002: RLS sin políticas y sin privilegios para anon/authenticated (Supabase).
    for table in ("tools", "application_tools"):
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE tools, application_tools FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_table('application_tools')
    op.drop_index(op.f('ix_tools_name'), table_name='tools')
    op.drop_table('tools')
