"""SQLAlchemy ORM model and Pydantic schemas for user feedback."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import SMALLINT, TIMESTAMP, Column, Text, text
from sqlalchemy.dialects.postgresql import UUID

from app.models.building import Base


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_text = Column(Text, nullable=False)
    result_image_id = Column(UUID(as_uuid=True), nullable=False)  # FK set at DB level
    rating = Column(SMALLINT, nullable=False)
    reason = Column(Text, nullable=True)
    session_id = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))


class FeedbackCreate(BaseModel):
    query_text: str
    result_image_id: uuid.UUID
    rating: Literal[-1, 0, 1]
    reason: Optional[str] = Field(default=None, max_length=500)
    session_id: str


class FeedbackRead(BaseModel):
    id: uuid.UUID
    query_text: str
    result_image_id: uuid.UUID
    rating: int
    reason: Optional[str] = None
    session_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
