"""create reports table

Revision ID: 0002_reports
Revises: 0001_image_segments
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_reports"
down_revision = "0001_image_segments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("cache_key", sa.Text(), nullable=False),
        sa.Column("image_ids", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("focus", sa.Text(), nullable=True),
        sa.Column("report_json", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("ix_reports_cache_key", "reports", ["cache_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_reports_cache_key", table_name="reports")
    op.drop_table("reports")
