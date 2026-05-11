"""Retrieval pipeline — CLIP-only, no LLM stages.

Pipeline:
  1. Embed query (text or reference image) via finetuned CLIP checkpoint
  2. FAISS inner-product search (cosine on L2-normalised vectors)
  3. Absolute score threshold filter
  4. Hard metadata filters (optional)
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
    score_threshold: float = 0.20   # absolute cosine similarity cutoff
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

    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
    from sqlalchemy import Text
    from app.models.building import Building
    from app.models.source import Image

    id_uuids = [uuid.UUID(i) for i in candidate_ids]
    q = (
        db.query(Image.id)
        .outerjoin(Building, Building.id == Image.building_id)
        .filter(Image.id.in_(id_uuids))
    )

    period = filters.get("period")
    if period and len(period) == 2:
        q = q.filter(
            Building.year_built >= period[0],
            Building.year_built <= period[1],
        )

    typology = filters.get("typology")
    if typology:
        q = q.filter(Building.typology.op("&&")(cast(typology, PG_ARRAY(Text))))

    material = filters.get("material")
    if material:
        q = q.filter(Building.materials.op("&&")(cast(material, PG_ARRAY(Text))))

    country = filters.get("country")
    if country:
        q = q.filter(Building.location_country == country)

    climate_zone = filters.get("climate_zone")
    if climate_zone:
        q = q.filter(Building.climate_zone == climate_zone)

    structural_system = filters.get("structural_system")
    if structural_system:
        q = q.filter(Building.structural_system == structural_system)

    kept = {str(r.id) for r in q.all()}
    return [i for i in candidate_ids if i in kept]


def _fetch_result_metadata(
    image_ids: list[str],
    db: Session,
) -> dict[str, dict[str, Any]]:
    if not image_ids:
        return {}

    from app.models.building import Building
    from app.models.source import Image, Source

    id_uuids = [uuid.UUID(i) for i in image_ids]
    rows = (
        db.query(Image, Building, Source)
        .outerjoin(Building, Building.id == Image.building_id)
        .outerjoin(Source, Source.id == Image.source_id)
        .filter(Image.id.in_(id_uuids))
        .all()
    )

    result: dict[str, dict[str, Any]] = {}
    for image, building, source in rows:
        result[str(image.id)] = {
            "image": image,
            "building": building,
            "source": source,
        }
    return result


def _building_to_dict(building) -> dict[str, Any]:
    if building is None:
        return {}
    return {
        "name": building.name,
        "architect": building.architect,
        "year_built": building.year_built,
        "location_city": building.location_city,
        "location_country": building.location_country,
        "typology": building.typology,
        "materials": building.materials,
        "structural_system": building.structural_system,
        "climate_zone": building.climate_zone,
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
        row = meta_map.get(iid, {})
        building = row.get("building")
        source = row.get("source")
        image_obj = row.get("image")

        results.append({
            "building_id": str(building.id) if building else None,
            "image_id": iid,
            "score": round(candidate_scores[iid], 4),
            "metadata": _building_to_dict(building),
            "source": {
                "url": source.url if source else None,
                "license": (
                    image_obj.license
                    if image_obj
                    else (source.license if source else None)
                ),
                "photographer": image_obj.photographer if image_obj else None,
                "license_url": image_obj.license_url if image_obj else None,
            },
            "image_url": f"/images/{iid}/raw",
            "image_metadata": image_obj.metadata_json if image_obj else {},
            "tags": image_obj.tags if image_obj else [],
        })

    latency["total"] = _elapsed(t_total)
    return {"results": results, "latency_ms": latency}
