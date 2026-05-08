"""Search endpoint — the primary API surface."""
from __future__ import annotations

import hashlib
import time
import uuid
from typing import Any, Literal, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
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
    config: Literal["default", "baseline", "clip_filters", "clip_rerank", "tuned_clip", "tuned_rerank", "full_no_mmr", "full"] = "default"


_CONFIG_PRESETS: dict[str, dict[str, Any]] = {
    "default": {
        "use_query_rewrite": True,
        "embedder": "tuned_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "rrf",
        "use_reranker": True,
        "use_mmr": True,
        "use_grounded_synthesis": True,
    },
    "baseline": {
        "use_query_rewrite": False,
        "embedder": "base_clip",
        "use_style_index": False,
        "use_filters": False,
        "fusion_method": "clip_only",
        "use_reranker": False,
        "use_mmr": False,
        "use_grounded_synthesis": False,
    },
    "clip_filters": {
        "use_query_rewrite": False,
        "embedder": "base_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "clip_only",
        "use_reranker": False,
        "use_mmr": False,
        "use_grounded_synthesis": False,
    },
    "clip_rerank": {
        "use_query_rewrite": False,
        "embedder": "base_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "clip_only",
        "use_reranker": True,
        "use_mmr": False,
        "use_grounded_synthesis": False,
    },
    "tuned_clip": {
        "use_query_rewrite": False,
        "embedder": "tuned_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "clip_only",
        "use_reranker": False,
        "use_mmr": False,
        "use_grounded_synthesis": False,
    },
    "tuned_rerank": {
        "use_query_rewrite": False,
        "embedder": "tuned_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "clip_only",
        "use_reranker": True,
        "use_mmr": False,
        "use_grounded_synthesis": False,
    },
    "full_no_mmr": {
        "use_query_rewrite": True,
        "embedder": "tuned_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "rrf",
        "use_reranker": True,
        "use_mmr": False,
        "use_grounded_synthesis": True,
    },
    "full": {
        "use_query_rewrite": True,
        "embedder": "tuned_clip",
        "use_style_index": False,
        "use_filters": True,
        "fusion_method": "rrf",
        "use_reranker": True,
        "use_mmr": True,
        "use_grounded_synthesis": True,
    },
}


@router.post("/search")
async def search(
    request: SearchRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    query_hash = hashlib.sha256(request.query.encode()).hexdigest()[:16]
    log = logger.bind(query_hash=query_hash, config=request.config)
    log.info("search_request", query_len=len(request.query))

    preset = _CONFIG_PRESETS.get(request.config, _CONFIG_PRESETS["default"])
    retrieval_cfg = RetrievalConfig(
        **preset,
        mmr_lambda=settings.mmr_lambda,
        top_k_retrieve=settings.top_k_retrieve,
        top_k_final=settings.top_k_final,
    )

    result = await run_retrieval(
        query=request.query,
        image_id=request.image_id,
        filters=request.filters.model_dump(exclude_none=True),
        config=retrieval_cfg,
        db=db,
        settings=settings,
    )

    log.info("search_complete", latency_total=result.get("latency_ms", {}).get("total"))
    return result
