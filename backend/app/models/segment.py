"""SQLAlchemy ORM model for component-level image segments.

One row per detected architectural region (window, canopy, arch, …) of an
ingested image. The CLIP embedding is stored both here (source of truth,
allows FAISS rebuild) and in the `segments` FAISS index (search copy).
"""
from __future__ import annotations

import uuid

from sqlalchemy import TIMESTAMP, Column, Float, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from app.models.building import Base


class ImageSegment(Base):
    __tablename__ = "image_segments"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id        = Column(
        UUID(as_uuid=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
    )
    label           = Column(Text, nullable=True)   # CLIP architectural label; NULL = unlabelled
    # Normalised bbox (0–1, relative to original image): x, y, width, height
    bbox_x          = Column(Float, nullable=False)
    bbox_y          = Column(Float, nullable=False)
    bbox_w          = Column(Float, nullable=False)
    bbox_h          = Column(Float, nullable=False)
    mask_area_ratio = Column(Float, nullable=False)
    clip_embedding  = Column(ARRAY(Float), nullable=True)  # 512-dim, L2-normalised
    crop_path       = Column(Text, nullable=True)
    created_at      = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))

    __table_args__ = (
        Index("ix_image_segments_image_id", "image_id"),
        Index("ix_image_segments_label", "label"),
    )
