"""Esquema inicial: users, admin_sessions, applications, api_keys, api_request_logs.

Revision ID: 0001
Revises:
Create Date: 2026-09-26 09:16:35.621235
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('applications',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('slug', sa.String(length=80), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('rate_limit_rpm', sa.Integer(), nullable=True),
    sa.Column('monthly_token_quota', sa.BigInteger(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_applications_slug'), 'applications', ['slug'], unique=True)
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('admin_sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('csrf_token', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ip', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_admin_sessions_user_id'), 'admin_sessions', ['user_id'], unique=False)
    op.create_table('api_keys',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('application_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('prefix', sa.String(length=32), nullable=False),
    sa.Column('key_hash', sa.String(length=64), nullable=False),
    sa.Column('environment', sa.String(length=8), nullable=False),
    sa.Column('permissions', postgresql.JSONB(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('rate_limit_rpm', sa.Integer(), nullable=True),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key_hash')
    )
    op.create_index(op.f('ix_api_keys_application_id'), 'api_keys', ['application_id'], unique=False)
    op.create_index(op.f('ix_api_keys_prefix'), 'api_keys', ['prefix'], unique=False)
    op.create_table('api_request_logs',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('api_key_id', sa.Uuid(), nullable=True),
    sa.Column('application_id', sa.Uuid(), nullable=True),
    sa.Column('key_prefix', sa.String(length=32), nullable=True),
    sa.Column('endpoint', sa.String(length=64), nullable=False),
    sa.Column('method', sa.String(length=8), nullable=False),
    sa.Column('model', sa.String(length=120), nullable=True),
    sa.Column('prompt_tokens', sa.Integer(), nullable=False),
    sa.Column('completion_tokens', sa.Integer(), nullable=False),
    sa.Column('total_tokens', sa.Integer(), nullable=False),
    sa.Column('processing_ms', sa.Integer(), nullable=False),
    sa.Column('status_code', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('error', sa.String(length=500), nullable=True),
    sa.Column('client_ip', sa.String(length=64), nullable=True),
    sa.Column('request_content', sa.Text(), nullable=True),
    sa.Column('response_content', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['api_key_id'], ['api_keys.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_api_request_logs_app_created', 'api_request_logs', ['application_id', 'created_at'], unique=False)
    op.create_index('ix_api_request_logs_created_at', 'api_request_logs', ['created_at'], unique=False)
    op.create_index('ix_api_request_logs_key_created', 'api_request_logs', ['api_key_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_api_request_logs_status'), 'api_request_logs', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_api_request_logs_status'), table_name='api_request_logs')
    op.drop_index('ix_api_request_logs_key_created', table_name='api_request_logs')
    op.drop_index('ix_api_request_logs_created_at', table_name='api_request_logs')
    op.drop_index('ix_api_request_logs_app_created', table_name='api_request_logs')
    op.drop_table('api_request_logs')
    op.drop_index(op.f('ix_api_keys_prefix'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_application_id'), table_name='api_keys')
    op.drop_table('api_keys')
    op.drop_index(op.f('ix_admin_sessions_user_id'), table_name='admin_sessions')
    op.drop_table('admin_sessions')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_applications_slug'), table_name='applications')
    op.drop_table('applications')
