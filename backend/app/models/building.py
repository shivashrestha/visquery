"""SQLAlchemy ORM model and Pydantic schemas for buildings."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import (
    TIMESTAMP,
    Column,
    Double,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Building(Base):
    __tablename__ = "buildings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    architect = Column(Text, nullable=True)
    year_built = Column(Integer, nullable=True)
    # year_range stored as two ints for compatibility without psycopg2 range type
    year_range_start = Column(Integer, nullable=True)
    year_range_end = Column(Integer, nullable=True)
    location_country = Column(Text, nullable=True)
    location_city = Column(Text, nullable=True)
    latitude = Column(Double, nullable=True)
    longitude = Column(Double, nullable=True)
    typology = Column(ARRAY(Text), nullable=True)
    materials = Column(ARRAY(Text), nullable=True)
    structural_system = Column(Text, nullable=True)
    climate_zone = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    embedding_version = Column(Text, nullable=False, default="base")
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=text("NOW()"),
        onupdate=datetime.utcnow,
    )


class BuildingRead(BaseModel):
    """Full building record returned by the API."""

    id: uuid.UUID
    name: str
    architect: Optional[str] = None
    year_built: Optional[int] = None
    year_range_start: Optional[int] = None
    year_range_end: Optional[int] = None
    location_country: Optional[str] = None
    location_city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    typology: Optional[list[str]] = None
    materials: Optional[list[str]] = None
    structural_system: Optional[str] = None
    climate_zone: Optional[str] = None
    description: Optional[str] = None
    embedding_version: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BuildingCreate(BaseModel):
    name: str
    architect: Optional[str] = None
    year_built: Optional[int] = None
    year_range_start: Optional[int] = None
    year_range_end: Optional[int] = None
    location_country: Optional[str] = None
    location_city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    typology: Optional[list[str]] = None
    materials: Optional[list[str]] = None
    structural_system: Optional[str] = None
    climate_zone: Optional[str] = None
    description: Optional[str] = None
    embedding_version: str = "base"


class SearchResultItem(BaseModel):
    """Single result in a search response."""

    building_id: uuid.UUID
    image_id: uuid.UUID
    score: float = Field(ge=0.0, le=1.0)
    explanation: str = ""
    metadata: dict = Field(default_factory=dict)
    source: dict = Field(default_factory=dict)
