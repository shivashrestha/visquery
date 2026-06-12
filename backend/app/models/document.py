"""SQLAlchemy ORM models for ingested documents (PDF/PPTx) and their text chunks.

Documents power "Ask the Archive" RAG chat. The BGE embedding is stored on
each chunk (source of truth — cosine search runs directly over these rows).
"""
from __future__ import annotations

import uuid

from sqlalchemy import TIMESTAMP, Column, Float, ForeignKey, Index, Integer, Text
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from app.models.building import Base


class DocSource(Base):
    __tablename__ = "doc_sources"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title        = Column(Text, nullable=False)
    file_type    = Column(Text, nullable=False)   # pdf | pptx
    storage_path = Column(Text, nullable=False)
    sha256       = Column(Text, unique=True, nullable=False)
    page_count   = Column(Integer, nullable=True)
    chunk_count  = Column(Integer, nullable=False, server_default=sql_text("0"))
    index_status = Column(Text, nullable=False, server_default=sql_text("'queued'"))  # queued | indexing | ready | failed
    index_error  = Column(Text, nullable=True)
    owner        = Column(Text, nullable=True)    # studio user email; NULL = public/seeded
    created_at   = Column(TIMESTAMP(timezone=True), server_default=sql_text("NOW()"))


class DocChunk(Base):
    __tablename__ = "doc_chunks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id   = Column(
        UUID(as_uuid=True),
        ForeignKey("doc_sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_number = Column(Integer, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    text        = Column(Text, nullable=False)
    embedding   = Column(ARRAY(Float), nullable=True)  # 384-dim BGE, L2-normalised
    created_at  = Column(TIMESTAMP(timezone=True), server_default=sql_text("NOW()"))

    __table_args__ = (
        Index("ix_doc_chunks_source_id", "source_id"),
    )
