"""2FA (TOTP + códigos de recuperación) y enlaces de recuperación de contraseña.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-26 17:12:03.829260
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('password_reset_tokens',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ip', sa.String(length=64), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_password_reset_tokens_user_id'), 'password_reset_tokens', ['user_id'], unique=False)
    op.execute('ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE password_reset_tokens FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('totp_secret', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('totp_pending_secret', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('totp_last_step', sa.BigInteger(), nullable=True))
    op.add_column('users', sa.Column('recovery_codes', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'recovery_codes')
    op.drop_column('users', 'totp_last_step')
    op.drop_column('users', 'totp_pending_secret')
    op.drop_column('users', 'totp_secret')
    op.drop_column('users', 'totp_enabled')
    op.drop_index(op.f('ix_password_reset_tokens_user_id'), table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
