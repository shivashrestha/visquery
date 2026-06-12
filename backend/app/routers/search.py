"""Search endpoint — CLIP-only retrieval, no LLM stages."""
from __future__ import annotations

import hashlib
import uuid
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text as sa_text
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
    climate_zone: Optional[list[str]] = None
    structural_system: Optional[list[str]] = None
    style: Optional[list[str]] = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    image_id: Optional[uuid.UUID] = None
    filters: SearchFilters = Field(default_factory=SearchFilters)
    score_threshold: float = Field(default=0.10, ge=0.0, le=1.0)


@router.get("/facets")
def get_facets(db: Session = Depends(get_db)) -> dict:
    """Return top values per filterable facet, sourced from DB counts."""

    style_rows = db.execute(sa_text("""
        SELECT
            replace(lower(artifacts_json->'style'->>'primary'), '_', ' ') AS val,
            COUNT(*) AS cnt
        FROM images
        WHERE artifacts_json->'style'->>'primary' IS NOT NULL
          AND artifacts_json->'style'->>'primary' NOT IN ('null', '')
          AND ingest_status = 'ready'
        GROUP BY val
        ORDER BY cnt DESC
        LIMIT 30
    """)).fetchall()

    btype_rows = db.execute(sa_text("""
        SELECT
            lower(metadata_json->>'building_type') AS val,
            COUNT(*) AS cnt
        FROM images
        WHERE metadata_json->>'building_type' IS NOT NULL
          AND metadata_json->>'building_type' NOT IN ('null', '')
          AND ingest_status = 'ready'
        GROUP BY val
        ORDER BY cnt DESC
        LIMIT 10
    """)).fetchall()

    mat_rows = db.execute(sa_text("""
        SELECT
            lower(m) AS val,
            COUNT(*) AS cnt
        FROM images, unnest(materials) AS m
        WHERE materials IS NOT NULL
          AND ingest_status = 'ready'
        GROUP BY val
        ORDER BY cnt DESC
        LIMIT 30
    """)).fetchall()

    def to_list(rows):
        return [{"value": r[0], "count": int(r[1])} for r in rows if r[0]]

    return {
        "style": to_list(style_rows),
        "building_type": to_list(btype_rows),
        "material": to_list(mat_rows),
    }


@router.get("/tag-quality")
def get_tag_quality(db: Session = Depends(get_db)) -> dict:
    """Tag validation stats + quarantine diagnostics (read-only monitoring)."""
    count_rows = db.execute(sa_text("""
        SELECT COALESCE(tag_status, 'unvalidated') AS status, COUNT(*) AS cnt
        FROM images
        WHERE ingest_status = 'ready'
        GROUP BY status
    """)).fetchall()
    counts = {r[0]: int(r[1]) for r in count_rows}

    quarantine_rows = db.execute(sa_text("""
        SELECT id, caption, tag_signals
        FROM images
        WHERE tag_status = 'quarantined'
        ORDER BY created_at DESC
        LIMIT 50
    """)).fetchall()

    quarantined = []
    for r in quarantine_rows:
        signals = r[2] or {}
        quarantined.append({
            "image_id": str(r[0]),
            "title": r[1],
            "image_url": f"/images/{r[0]}/raw",
            "stripped": signals.get("stripped", []),
            "vlm_confidence": signals.get("vlm_confidence"),
            "clip": signals.get("clip", {}),
            "neighbors": signals.get("neighbors"),
            "retry": signals.get("retry"),
            "validated_at": signals.get("validated_at"),
        })

    return {
        "counts": {
            "verified": counts.get("verified", 0),
            "provisional": counts.get("provisional", 0),
            "quarantined": counts.get("quarantined", 0),
            "unvalidated": counts.get("unvalidated", 0),
        },
        "quarantined": quarantined,
    }


def _embed_crop_sync(raw: bytes):
    """CLIP-embed an uploaded crop with the same model used by the segment indexer."""
    import io

    import numpy as np
    import torch
    from PIL import Image as PILImage

    from app.routers.segment import _get_clip

    pil = PILImage.open(io.BytesIO(raw)).convert("RGB")
    clip_m, preprocess, _ = _get_clip()
    with torch.inference_mode():
        feats = clip_m.encode_image(preprocess(pil).unsqueeze(0))
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats[0].numpy().astype(np.float32)


@router.post("/search/by-segment")
async def search_by_segment(
    file: Optional[UploadFile] = File(default=None),
    image_id: Optional[str] = Form(default=None),
    segment_index: Optional[int] = Form(default=None),
    exclude_image_id: Optional[str] = Form(default=None),
    k: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Component-level visual search over indexed image segments.

    Query is either an indexed segment reference (image_id + segment_index,
    ordered by mask_area_ratio desc — the indexer's order) or an uploaded
    crop file, which is CLIP-embedded on the fly.
    Returns top-k parent images (deduped, best segment per image) with
    segment bbox + crop thumbnail.
    """
    import asyncio

    import numpy as np

    from app.models.segment import ImageSegment
    from app.models.source import Image as ImageModel
    from app.services.retrieval import _image_to_metadata
    from app.services.vector_store import get_segment_store

    exclude_image: Optional[uuid.UUID] = None
    query_label: Optional[str] = None
    query_crop_url: Optional[str] = None

    if image_id is not None and segment_index is not None:
        try:
            img_uuid = uuid.UUID(image_id)
        except ValueError:
            raise HTTPException(400, detail="Invalid image_id")
        seg_rows = (
            db.query(ImageSegment)
            .filter(ImageSegment.image_id == img_uuid)
            .order_by(ImageSegment.mask_area_ratio.desc(), ImageSegment.id)
            .all()
        )
        if not seg_rows:
            raise HTTPException(404, detail="Image has no indexed segments")
        if segment_index < 0 or segment_index >= len(seg_rows):
            raise HTTPException(404, detail=f"segment_index out of range (0–{len(seg_rows) - 1})")
        seg = seg_rows[segment_index]
        if not seg.clip_embedding:
            raise HTTPException(409, detail="Segment has no stored embedding")
        qvec = np.asarray(seg.clip_embedding, dtype=np.float32)
        exclude_image = img_uuid
        query_label = seg.label
        query_crop_url = f"/images/segments/{seg.id}/crop"
    elif file is not None:
        if file.content_type and not file.content_type.startswith("image/"):
            raise HTTPException(400, detail="Only image files are supported")
        raw = await file.read()
        if not raw:
            raise HTTPException(400, detail="Empty file")
        loop = asyncio.get_running_loop()
        qvec = await loop.run_in_executor(None, _embed_crop_sync, raw)
        # Crop came from a known corpus image — keep it out of its own results
        if exclude_image_id:
            try:
                exclude_image = uuid.UUID(exclude_image_id)
            except ValueError:
                pass
    else:
        raise HTTPException(422, detail="Provide either a crop file or image_id + segment_index")

    store = get_segment_store(settings.embedding_version, settings.faiss_data_dir)
    if store.size == 0:
        return {"results": [], "query": {"label": query_label, "crop_url": query_crop_url}}

    # Oversample: an image contributes up to 12 segments and the query's own
    # segments must be excluded — k*4 can exhaust after a few parents.
    seg_ids, scores = store.search(qvec, k * 8)
    score_by_id = dict(zip(seg_ids, scores))

    seg_uuids = [uuid.UUID(s) for s in seg_ids]
    rows = (
        db.query(ImageSegment, ImageModel)
        .join(ImageModel, ImageSegment.image_id == ImageModel.id)
        .filter(ImageSegment.id.in_(seg_uuids))
        .all()
    )
    by_seg_id = {str(seg.id): (seg, img) for seg, img in rows}

    results: list[dict] = []
    seen_images: set[str] = set()
    for sid in seg_ids:  # FAISS order = descending score
        entry = by_seg_id.get(sid)
        if entry is None:
            continue
        seg, img = entry
        if exclude_image is not None and seg.image_id == exclude_image:
            continue
        iid = str(img.id)
        if iid in seen_images:
            continue
        seen_images.add(iid)
        results.append({
            "building_id": None,
            "image_id": iid,
            "score": round(score_by_id[sid], 4),
            "metadata": _image_to_metadata(img),
            "source": {
                "url": img.source_url or "",
                "title": img.source_title,
                "license": img.license,
                "photographer": img.photographer,
                "license_url": img.license_url,
            },
            "image_url": f"/images/{iid}/raw",
            "image_metadata": img.metadata_json or {},
            "artifacts_json": img.artifacts_json or None,
            "tags": img.tags or [],
            "segment": {
                "id": sid,
                "label": seg.label,
                "bbox": [seg.bbox_x, seg.bbox_y, seg.bbox_w, seg.bbox_h],
                "mask_area_ratio": seg.mask_area_ratio,
                "crop_url": f"/images/segments/{sid}/crop",
            },
        })
        if len(results) >= k:
            break

    return {"results": results, "query": {"label": query_label, "crop_url": query_crop_url}}


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
