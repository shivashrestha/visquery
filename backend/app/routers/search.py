"""Search endpoint — CLIP-only retrieval, no LLM stages."""
from __future__ import annotations

import hashlib
import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.deps import get_db
from app.services.retrieval import RetrievalConfig, run_retrieval

logger = structlog.get_logger()

router = APIRouter(tags=["search"])


class SearchFilters(BaseModel):
    period: Optional[tuple[int, int]] = None
    typology: Optional[list[str]] = None
    material: Optional[list[str]] = None
    country: Optional[str] = None
    climate_zone: Optional[str] = None
    structural_system: Optional[str] = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    image_id: Optional[uuid.UUID] = None
    filters: SearchFilters = Field(default_factory=SearchFilters)
    score_threshold: float = Field(default=0.20, ge=0.0, le=1.0)


@router.post("/search")
async def search(
    request: SearchRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    query_hash = hashlib.sha256(request.query.encode()).hexdigest()[:16]
    log = logger.bind(query_hash=query_hash)
    log.info("search_request", query_len=len(request.query))

    config = RetrievalConfig(
        use_filters=True,
        score_threshold=request.score_threshold,
        top_k_retrieve=settings.top_k_retrieve,
        top_k_final=settings.top_k_final,
    )

    result = await run_retrieval(
        query=request.query,
        image_id=request.image_id,
        filters=request.filters.model_dump(exclude_none=True),
        config=config,
        db=db,
        settings=settings,
    )

    log.info("search_complete", latency_total=result.get("latency_ms", {}).get("total"))
    return result
