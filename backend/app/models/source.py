"""SQLAlchemy ORM model and Pydantic schemas for sources and images."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import ARRAY, TIMESTAMP, Column, Date, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID

from app.models.building import Base


class Source(Base):
    __tablename__ = "sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url = Column(Text, unique=True, nullable=False)
    title = Column(Text, nullable=False)
    publication = Column(Text, nullable=True)
    authors = Column(ARRAY(Text), nullable=True)
    publish_date = Column(Date, nullable=True)
    license = Column(Text, nullable=False)
    text_excerpt = Column(Text, nullable=False, default="")
    retrieved_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
    spider_name = Column(Text, nullable=False)


class Image(Base):
    __tablename__ = "images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    building_id = Column(UUID(as_uuid=True), nullable=True)  # FK set at DB level
    storage_path = Column(Text, nullable=False)
    sha256 = Column(Text, unique=True, nullable=False)
    phash = Column(Text, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    caption = Column(Text, nullable=True)
    caption_method = Column(Text, nullable=True)
    photographer = Column(Text, nullable=True)
    license = Column(Text, nullable=False)
    license_url = Column(Text, nullable=True)
    source_id = Column(UUID(as_uuid=True), nullable=True)  # FK set at DB level
    embedding_version = Column(Text, nullable=False, default="base")
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))


class SourceRead(BaseModel):
    id: uuid.UUID
    url: str
    title: str
    publication: Optional[str] = None
    authors: Optional[list[str]] = None
    publish_date: Optional[date] = None
    license: str
    text_excerpt: str
    retrieved_at: datetime
    spider_name: str

    model_config = {"from_attributes": True}


class ImageRead(BaseModel):
    id: uuid.UUID
    building_id: Optional[uuid.UUID] = None
    storage_path: str
    sha256: str
    phash: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    caption: Optional[str] = None
    caption_method: Optional[str] = None
    photographer: Optional[str] = None
    license: str
    license_url: Optional[str] = None
    source_id: Optional[uuid.UUID] = None
    embedding_version: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SourceAttribution(BaseModel):
    """Compact source info attached to each search result."""

    url: str
    license: str
    photographer: Optional[str] = None
    license_url: Optional[str] = None
