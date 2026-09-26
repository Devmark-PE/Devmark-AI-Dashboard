"""RAG: documentos y fragmentos por aplicación, índice de texto completo en español y bloqueo de la API REST de Supabase.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-26 11:19:26.268853
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('rag_documents',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('application_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=True),
    sa.Column('source_type', sa.String(length=16), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('char_count', sa.Integer(), nullable=False),
    sa.Column('chunk_count', sa.Integer(), nullable=False),
    sa.Column('created_by_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_rag_documents_application_id'), 'rag_documents', ['application_id'], unique=False)
    op.create_table('rag_chunks',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('document_id', sa.Uuid(), nullable=False),
    sa.Column('application_id', sa.Uuid(), nullable=False),
    sa.Column('ordinal', sa.Integer(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('search_text', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['document_id'], ['rag_documents.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_rag_chunks_app', 'rag_chunks', ['application_id'], unique=False)
    op.create_index(op.f('ix_rag_chunks_document_id'), 'rag_chunks', ['document_id'], unique=False)
    op.add_column('applications', sa.Column('rag_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('applications', sa.Column('rag_top_k', sa.Integer(), server_default='3', nullable=False))

    # Índice de texto completo en español sobre el contenido normalizado (sin acentos, minúsculas).
    op.execute("CREATE INDEX ix_rag_chunks_fts ON rag_chunks USING gin (to_tsvector('spanish', search_text))")

    # Mismas protecciones que 0002: RLS sin políticas y sin privilegios para anon/authenticated (Supabase).
    for table in ("rag_documents", "rag_chunks"):
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON TABLE rag_documents, rag_chunks FROM %I', r);
              EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_column('applications', 'rag_top_k')
    op.drop_column('applications', 'rag_enabled')
    op.execute("DROP INDEX IF EXISTS ix_rag_chunks_fts")
    op.drop_index(op.f('ix_rag_chunks_document_id'), table_name='rag_chunks')
    op.drop_index('ix_rag_chunks_app', table_name='rag_chunks')
    op.drop_table('rag_chunks')
    op.drop_index(op.f('ix_rag_documents_application_id'), table_name='rag_documents')
    op.drop_table('rag_documents')
