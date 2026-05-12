"""Retrieval pipeline — CLIP-only, no LLM stages.

Pipeline:
  1. Embed query (text or reference image) via CLIP
  2. FAISS inner-product search (cosine on L2-normalised vectors)
  3. Absolute score threshold filter
  4. Hard metadata filters (optional) — all on images table
  5. Fetch and return result metadata
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

    # Architectural style: matched against VLM-classified style in metadata_json JSONB
    style = filters.get("style")
    if style:
        style_lower = [v.lower() for v in style]
        style_field = func.lower(Image.metadata_json["architecture_style_classified"].astext)
        q = q.filter(or_(*[style_field.ilike(f"%{v}%") for v in style_lower]))

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
    from app.services.vector_store import get_clip_store

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)

    # 1. Embed + search
    t = _tick()
    if image_id is not None:
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
    else:
        query_vec = await loop.run_in_executor(CLIP_EXECUTOR, emb_service.embed_text, query)

    ids, scores = clip_store.search(query_vec, config.top_k_retrieve)
    latency["embed_search"] = _elapsed(t)

    # 2. Absolute score threshold
    t = _tick()
    if scores:
        logger.info("clip_scores", top5=scores[:5], threshold=config.score_threshold)
    pairs = [
        (iid, score)
        for iid, score in zip(ids, scores)
        if score >= config.score_threshold
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
            "tags": img.tags or [],
        })

    latency["total"] = _elapsed(t_total)
    return {"results": results, "latency_ms": latency}
