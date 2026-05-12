"""SQLAlchemy ORM model and Pydantic schemas for images."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import ARRAY, TIMESTAMP, Boolean, Column, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.models.building import Base


class Image(Base):
    __tablename__ = "images"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    storage_path     = Column(Text, nullable=False)
    sha256           = Column(Text, unique=True, nullable=False)
    phash            = Column(Text, nullable=True)
    width            = Column(Integer, nullable=True)
    height           = Column(Integer, nullable=True)
    caption          = Column(Text, nullable=True)
    caption_method   = Column(Text, nullable=True)
    photographer     = Column(Text, nullable=True)
    license          = Column(Text, nullable=False)
    license_url      = Column(Text, nullable=True)

    # Structured metadata (populated by metadata_extractor after captioning)
    name             = Column(Text, nullable=True)
    architect        = Column(Text, nullable=True)
    year_built       = Column(Integer, nullable=True)
    location_country = Column(Text, nullable=True)
    location_city    = Column(Text, nullable=True)
    typology         = Column(ARRAY(Text), nullable=True)
    materials        = Column(ARRAY(Text), nullable=True)
    structural_system= Column(Text, nullable=True)
    climate_zone     = Column(Text, nullable=True)
    description      = Column(Text, nullable=True)

    # Inline source provenance
    source_url       = Column(Text, nullable=True)
    source_title     = Column(Text, nullable=True)
    source_spider    = Column(Text, nullable=True)

    # Raw VLM output + indexing state
    embedding_version= Column(Text, nullable=False, default="base")
    metadata_json    = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    tags             = Column(ARRAY(Text), nullable=False, server_default=text("'{}'::text[]"))
    ingest_status    = Column(Text, nullable=False, server_default=text("'embedded'"))
    metadata_ready   = Column(Boolean, nullable=False, server_default=text("false"))
    created_at       = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))


class ImageRead(BaseModel):
    id: uuid.UUID
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
    name: Optional[str] = None
    architect: Optional[str] = None
    year_built: Optional[int] = None
    location_country: Optional[str] = None
    location_city: Optional[str] = None
    typology: Optional[list[str]] = None
    materials: Optional[list[str]] = None
    structural_system: Optional[str] = None
    climate_zone: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_spider: Optional[str] = None
    embedding_version: str
    metadata_json: dict
    tags: list[str]
    ingest_status: str
    metadata_ready: bool
    created_at: datetime

    model_config = {"from_attributes": True}
