"""SQLAlchemy ORM model for cached precedent reports.

One row per generated report. cache_key is a sha256 over the ordered
image ids + ephemeral payload + focus, so regenerating the same study
is a free DB lookup instead of an LLM call.
"""
from __future__ import annotations

import uuid

from sqlalchemy import TIMESTAMP, Column, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

from app.models.building import Base


class Report(Base):
    __tablename__ = "reports"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_key   = Column(Text, unique=True, nullable=False, index=True)
    image_ids   = Column(ARRAY(Text), nullable=False)   # ordered, matches IMG-n refs
    focus       = Column(Text, nullable=True)
    report_json = Column(JSONB, nullable=False)
    created_at  = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
