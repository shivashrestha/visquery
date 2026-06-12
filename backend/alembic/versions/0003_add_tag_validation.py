"""add tag_status + tag_signals to images

Revision ID: 0003_tag_validation
Revises: 0002_reports
Create Date: 2026-06-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_tag_validation"
down_revision = "0002_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL = not yet validated; values constrained at the app layer
    op.add_column(
        "images",
        sa.Column("tag_status", sa.Text(), nullable=True),
    )
    op.add_column(
        "images",
        sa.Column("tag_signals", postgresql.JSONB(), nullable=True),
    )
    op.create_check_constraint(
        "ck_images_tag_status",
        "images",
        "tag_status IN ('verified', 'provisional', 'quarantined')",
    )
    op.create_index("ix_images_tag_status", "images", ["tag_status"])


def downgrade() -> None:
    op.drop_index("ix_images_tag_status", table_name="images")
    op.drop_constraint("ck_images_tag_status", "images", type_="check")
    op.drop_column("images", "tag_signals")
    op.drop_column("images", "tag_status")
