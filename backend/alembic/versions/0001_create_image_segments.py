"""create image_segments table

Revision ID: 0001_image_segments
Revises:
Create Date: 2026-06-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_image_segments"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "image_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "image_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("images.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("bbox_x", sa.Float(), nullable=False),
        sa.Column("bbox_y", sa.Float(), nullable=False),
        sa.Column("bbox_w", sa.Float(), nullable=False),
        sa.Column("bbox_h", sa.Float(), nullable=False),
        sa.Column("mask_area_ratio", sa.Float(), nullable=False),
        sa.Column("clip_embedding", postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column("crop_path", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("ix_image_segments_image_id", "image_segments", ["image_id"])
    op.create_index("ix_image_segments_label", "image_segments", ["label"])


def downgrade() -> None:
    op.drop_index("ix_image_segments_label", table_name="image_segments")
    op.drop_index("ix_image_segments_image_id", table_name="image_segments")
    op.drop_table("image_segments")
