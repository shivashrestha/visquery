"""create doc_sources + doc_chunks tables for archive RAG chat

Revision ID: 0004_doc_chunks
Revises: 0003_add_tag_validation
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_doc_chunks"
down_revision = "0003_tag_validation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "doc_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("file_type", sa.Text(), nullable=False),  # pdf | pptx
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("sha256", sa.Text(), unique=True, nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        # queued | indexing | ready | failed
        sa.Column("index_status", sa.Text(), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("index_error", sa.Text(), nullable=True),
        sa.Column("owner", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )

    op.create_table(
        "doc_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("doc_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("ix_doc_chunks_source_id", "doc_chunks", ["source_id"])


def downgrade() -> None:
    op.drop_index("ix_doc_chunks_source_id", table_name="doc_chunks")
    op.drop_table("doc_chunks")
    op.drop_table("doc_sources")
