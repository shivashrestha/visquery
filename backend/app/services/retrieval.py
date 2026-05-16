"""Retrieval pipeline — hybrid text + CLIP, no LLM stages.

Pipeline (text query):
  1a. Embed query via BGE-small → text FAISS search
  1b. Embed query via CLIP     → CLIP FAISS search
  2.  RRF fusion of both ranked lists
  3.  Absolute score threshold filter
  4.  Hard metadata filters (optional) — all on images table
  5.  Fetch and return result metadata

Pipeline (image query):
  1.  Embed image via CLIP → CLIP FAISS search
  2.  If image_id in text store → also search text FAISS → RRF fusion
  3-5. Same as above
"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Optional

import numpy as np
import structlog
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings

logger = structlog.get_logger()


class RetrievalConfig(BaseModel):
    use_filters: bool = True
    score_threshold: float = 0.10
    top_k_retrieve: int = 100
    top_k_final: int = 20


def _tick() -> float:
    return time.perf_counter() * 1000


def _elapsed(start: float) -> int:
    return int(_tick() - start)


def _apply_filters(
    candidate_ids: list[str],
    filters: dict[str, Any],
    db: Session,
) -> list[str]:
    if not filters or not candidate_ids:
        return candidate_ids

    from sqlalchemy import func, or_
    from app.models.source import Image

    id_uuids = [uuid.UUID(i) for i in candidate_ids]
    q = db.query(Image.id).filter(Image.id.in_(id_uuids))

    period = filters.get("period")
    if period and len(period) == 2:
        q = q.filter(
            Image.year_built >= period[0],
            Image.year_built <= period[1],
        )

    # Typology: VLM outputs varied phrases (e.g. "government building", "abbey").
    # Use contains matching on the joined array string so "religious" matches
    # ["Abbey", "Religious", "Monastery"] and "office" matches ["government building", "office"].
    typology = filters.get("typology")
    if typology:
        typology_lower = [v.lower() for v in typology]
        joined_typology = func.lower(func.array_to_string(Image.typology, ","))
        q = q.filter(or_(*[joined_typology.ilike(f"%{v}%") for v in typology_lower]))

    # Materials: case-insensitive contains on joined array string
    material = filters.get("material")
    if material:
        material_lower = [v.lower() for v in material]
        joined_materials = func.lower(func.array_to_string(Image.materials, ","))
        q = q.filter(or_(*[joined_materials.ilike(f"%{v}%") for v in material_lower]))

    country = filters.get("country")
    if country:
        q = q.filter(func.lower(Image.location_country) == country.lower())

    # structural_system is free text — use ILIKE contains for any selected category
    structural_system = filters.get("structural_system")
    if structural_system:
        values = structural_system if isinstance(structural_system, list) else [structural_system]
        q = q.filter(or_(*[
            Image.structural_system.ilike(f"%{v.replace('_', ' ')}%")
            for v in values
        ]))

    # climate_zone may be free text or short keyword — ILIKE contains
    climate_zone = filters.get("climate_zone")
    if climate_zone:
        zones = climate_zone if isinstance(climate_zone, list) else [climate_zone]
        q = q.filter(or_(*[
            Image.climate_zone.ilike(f"%{z.replace('_', ' ')}%")
            for z in zones
        ]))

    # Architectural style: matched against artifacts_json.style.primary (preferred)
    # Falls back to metadata_json.architecture_style_classified for pre-V2 rows
    style = filters.get("style")
    if style:
        style_lower = [v.lower() for v in style]
        artifacts_style = func.lower(Image.artifacts_json["style"]["primary"].astext)
        meta_style = func.lower(Image.metadata_json["architecture_style_classified"].astext)
        q = q.filter(or_(
            *[artifacts_style.ilike(f"%{v}%") for v in style_lower],
            *[meta_style.ilike(f"%{v}%") for v in style_lower],
        ))

    kept = {str(r.id) for r in q.all()}
    return [i for i in candidate_ids if i in kept]


def _fetch_result_metadata(
    image_ids: list[str],
    db: Session,
) -> dict[str, Any]:
    if not image_ids:
        return {}

    from app.models.source import Image

    id_uuids = [uuid.UUID(i) for i in image_ids]
    rows = db.query(Image).filter(Image.id.in_(id_uuids)).all()
    return {str(img.id): img for img in rows}


def _rrf_fusion(
    ranked_lists: list[list[str]],
    score_maps: list[dict[str, float]],
    k: int = 60,
) -> list[tuple[str, float]]:
    """Reciprocal Rank Fusion across multiple ranked lists.
    Returns (image_id, rrf_score) sorted descending.
    Falls back to the first list if only one is non-empty.
    """
    non_empty = [r for r in ranked_lists if r]
    if len(non_empty) == 1:
        ids = non_empty[0]
        s_map = next(m for r, m in zip(ranked_lists, score_maps) if r)
        return [(iid, s_map.get(iid, 0.0)) for iid in ids]

    rrf: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, iid in enumerate(ranked):
            rrf[iid] = rrf.get(iid, 0.0) + 1.0 / (k + rank + 1)
    return sorted(rrf.items(), key=lambda x: x[1], reverse=True)


def _image_to_metadata(img) -> dict[str, Any]:
    return {
        "name": img.name,
        "architect": img.architect,
        "year_built": img.year_built,
        "location_city": img.location_city,
        "location_country": img.location_country,
        "typology": img.typology or [],
        "materials": img.materials or [],
        "structural_system": img.structural_system,
        "climate_zone": img.climate_zone,
        "description": img.description or img.caption,
    }


async def run_retrieval(
    query: str,
    image_id: Optional[uuid.UUID],
    filters: dict[str, Any],
    config: RetrievalConfig,
    db: Session,
    settings: Settings,
) -> dict[str, Any]:
    latency: dict[str, int] = {}
    t_total = _tick()
    loop = asyncio.get_running_loop()

    from app.services import embedder as emb_service
    from app.services.embedder import CLIP_EXECUTOR
    from app.services.text_embedder import TEXT_EXECUTOR, embed_text_query
    from app.services.vector_store import get_clip_store, get_text_store

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    text_store = get_text_store(settings.faiss_data_dir)

    # 1. Embed + search
    t = _tick()
    clip_ids: list[str] = []
    clip_scores_raw: list[float] = []
    text_ids: list[str] = []
    text_scores_raw: list[float] = []

    if image_id is not None:
        # Image query — CLIP primary, supplement with text store if image has metadata
        from app.models.source import Image as ImageModel
        img_row = db.query(ImageModel).filter(ImageModel.id == image_id).first()
        if img_row is None:
            return {"results": [], "latency_ms": {"total": _elapsed(t_total)}}

        import io
        from pathlib import Path
        from PIL import Image as PILImage

        local = Path(str(img_row.storage_path))
        if local.exists():
            pil_img = PILImage.open(local).convert("RGB")
        else:
            import httpx
            url = (
                f"{settings.object_storage_url}"
                f"/{settings.object_storage_bucket}"
                f"/{img_row.storage_path}"
            )
            resp = httpx.get(url, timeout=20)
            resp.raise_for_status()
            pil_img = PILImage.open(io.BytesIO(resp.content)).convert("RGB")

        query_vec = await loop.run_in_executor(CLIP_EXECUTOR, emb_service.embed_image, pil_img)
        clip_ids, clip_scores_raw = clip_store.search(query_vec, config.top_k_retrieve)

        # If this image has a text embedding, also search text store
        iid_str = str(image_id)
        if text_store.size > 0 and iid_str in text_store._id_map:
            import numpy as _np
            pos = text_store._id_map.index(iid_str)
            tvec = _np.zeros((text_store._dim,), dtype="float32")
            text_store._index.reconstruct(pos, tvec)
            text_ids, text_scores_raw = text_store.search(tvec, config.top_k_retrieve)
            # exclude self
            paired = [(i, s) for i, s in zip(text_ids, text_scores_raw) if i != iid_str]
            text_ids = [i for i, _ in paired]
            text_scores_raw = [s for _, s in paired]

    else:
        # Text query — run both indexes in parallel
        clip_fut = loop.run_in_executor(CLIP_EXECUTOR, emb_service.embed_text, query)
        text_fut = loop.run_in_executor(TEXT_EXECUTOR, embed_text_query, query)
        clip_vec, text_vec = await asyncio.gather(clip_fut, text_fut)

        clip_ids, clip_scores_raw = clip_store.search(clip_vec, config.top_k_retrieve)
        if text_store.size > 0:
            text_ids, text_scores_raw = text_store.search(text_vec, config.top_k_retrieve)

    latency["embed_search"] = _elapsed(t)

    # 2. RRF fusion
    t = _tick()
    clip_score_map = dict(zip(clip_ids, clip_scores_raw))
    text_score_map = dict(zip(text_ids, text_scores_raw))

    fused = _rrf_fusion(
        [clip_ids, text_ids],
        [clip_score_map, text_score_map],
    )

    if clip_scores_raw:
        logger.info("clip_scores", top5=clip_scores_raw[:5], threshold=config.score_threshold)
    if text_scores_raw:
        logger.info("text_scores", top5=text_scores_raw[:5])

    # Keep only pairs where at least one source clears the threshold
    pairs = [
        (iid, score)
        for iid, score in fused
        if clip_score_map.get(iid, 0.0) >= config.score_threshold
        or text_score_map.get(iid, 0.0) >= config.score_threshold
    ]
    latency["threshold"] = _elapsed(t)

    if not pairs:
        latency["total"] = _elapsed(t_total)
        return {"results": [], "latency_ms": latency}

    candidate_ids = [iid for iid, _ in pairs]
    candidate_scores = {iid: score for iid, score in pairs}

    # 3. Metadata filters
    t = _tick()
    if config.use_filters and filters:
        candidate_ids = _apply_filters(candidate_ids, filters, db)
    latency["filter"] = _elapsed(t)

    final_ids = candidate_ids[: config.top_k_final]

    # 4. Fetch metadata
    t = _tick()
    meta_map = _fetch_result_metadata(final_ids, db)
    latency["metadata"] = _elapsed(t)

    # 5. Build results
    results: list[dict[str, Any]] = []
    for iid in final_ids:
        img = meta_map.get(iid)
        if img is None:
            continue
        results.append({
            "building_id": None,
            "image_id": iid,
            "score": round(candidate_scores[iid], 4),
            "metadata": _image_to_metadata(img),
            "source": {
                "url": img.source_url,
                "title": img.source_title,
                "license": img.license,
                "photographer": img.photographer,
                "license_url": img.license_url,
            },
            "image_url": f"/images/{iid}/raw",
            "image_metadata": img.metadata_json or {},
            "artifacts_json": img.artifacts_json or None,
            "tags": img.tags or [],
        })

    latency["total"] = _elapsed(t_total)
    return {"results": results, "latency_ms": latency}
