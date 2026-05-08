"""Retrieval pipeline orchestrator.

Runs the full search pipeline based on a RetrievalConfig:
  1. Router agent — classify intent
  2. Rewriter agent — decompose into visual descriptions + filters
  3. Filter — apply hard metadata constraints
  4. Vector retrieval — CLIP (and optional style) index search
  5. Fusion — Reciprocal Rank Fusion across visual descriptions
  6. Reranker — cross-encoder rerank
  7. MMR — diversity reranking
  8. Synthesizer — grounded explanations
  9. Citation linker — attach source URL / license

Every stage records wall-clock latency. The returned dict matches the
SearchResult schema.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, Literal, Optional

import numpy as np
import structlog
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings

logger = structlog.get_logger()


class RetrievalConfig(BaseModel):
    use_query_rewrite: bool = True
    embedder: Literal["base_clip", "tuned_clip"] = "tuned_clip"
    use_style_index: bool = False
    use_filters: bool = True
    fusion_method: Literal["clip_only", "weighted", "rrf"] = "rrf"
    use_reranker: bool = True
    use_mmr: bool = True
    mmr_lambda: float = 0.7
    top_k_retrieve: int = 100
    top_k_final: int = 30
    use_grounded_synthesis: bool = True


def _tick() -> float:
    return time.perf_counter() * 1000  # milliseconds


def _elapsed(start: float) -> int:
    return int(_tick() - start)


def _rrf_fusion(
    ranked_lists: list[list[tuple[str, float]]],
    k: int = 60,
) -> list[tuple[str, float]]:
    """Reciprocal Rank Fusion across multiple ranked lists."""
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, (doc_id, _) in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def _weighted_fusion(
    ranked_lists: list[list[tuple[str, float]]],
) -> list[tuple[str, float]]:
    """Score-weighted fusion — average scores across lists."""
    scores: dict[str, list[float]] = {}
    for ranked in ranked_lists:
        for doc_id, score in ranked:
            scores.setdefault(doc_id, []).append(score)
    averaged = {doc_id: sum(s) / len(s) for doc_id, s in scores.items()}
    return sorted(averaged.items(), key=lambda x: x[1], reverse=True)


def _apply_filters(
    candidate_ids: list[str],
    filters: dict[str, Any],
    db: Session,
) -> list[str]:
    """Apply hard metadata filters. Returns filtered image IDs."""
    if not filters or not candidate_ids:
        return candidate_ids

    from app.models.building import Building
    from app.models.source import Image

    id_uuids = [uuid.UUID(i) for i in candidate_ids]

    q = (
        db.query(Image.id)
        .join(Building, Building.id == Image.building_id)
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
        q = q.filter(Building.typology.overlap(typology))

    material = filters.get("material")
    if material:
        q = q.filter(Building.materials.overlap(material))

    country = filters.get("country")
    if country:
        q = q.filter(Building.location_country == country)

    climate_zone = filters.get("climate_zone")
    if climate_zone:
        q = q.filter(Building.climate_zone == climate_zone)

    structural_system = filters.get("structural_system")
    if structural_system:
        q = q.filter(Building.structural_system == structural_system)

    rows = q.all()
    kept = {str(r.id) for r in rows}
    return [i for i in candidate_ids if i in kept]


def _fetch_result_metadata(
    image_ids: list[str],
    db: Session,
) -> dict[str, dict[str, Any]]:
    """Return metadata and source info keyed by image_id string."""
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
        image_id_str = str(image.id)
        result[image_id_str] = {
            "image": image,
            "building": building,
            "source": source,
        }
    return result


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

    # 1. Router
    t = _tick()
    if config.use_query_rewrite:
        from app.services import agents
        loop = asyncio.get_event_loop()
        route_result = await loop.run_in_executor(None, agents.route, query)
        intent = route_result["intent"]
    else:
        intent = "concept_search"
    latency["router"] = _elapsed(t)

    # 2. Rewriter
    t = _tick()
    rewritten: dict[str, Any] = {}
    visual_descriptions = [query]

    if config.use_query_rewrite and intent in ("concept_search", "hybrid"):
        from app.services import agents
        loop = asyncio.get_event_loop()
        rewritten = await loop.run_in_executor(None, agents.rewrite, query, intent)
        visual_descriptions = rewritten.get("visual_descriptions", [query]) or [query]
        if rewritten.get("filters") and config.use_filters:
            filters = {**rewritten["filters"], **filters}
    latency["rewrite"] = _elapsed(t)

    # 3 & 4. Vector retrieval
    t = _tick()
    from app.services import embedder as emb_service
    from app.services.vector_store import get_clip_store, get_style_store

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)

    ranked_lists: list[list[tuple[str, float]]] = []

    # Image-to-image: embed reference image if provided
    if image_id is not None:
        from app.models.source import Image as ImageModel
        img_row = db.query(ImageModel).filter(ImageModel.id == image_id).first()
        if img_row:
            import io
            from pathlib import Path
            from PIL import Image as PILImage

            local = Path(img_row.storage_path)
            if local.exists():
                pil_img = PILImage.open(local).convert("RGB")
            else:
                import httpx
                url = f"{settings.object_storage_url}/{settings.object_storage_bucket}/{img_row.storage_path}"
                resp = httpx.get(url, timeout=20)
                resp.raise_for_status()
                pil_img = PILImage.open(io.BytesIO(resp.content)).convert("RGB")

            loop = asyncio.get_event_loop()
            ref_vec = await loop.run_in_executor(None, emb_service.embed_image, pil_img)
            ids, scores = clip_store.search(ref_vec, config.top_k_retrieve)
            ranked_lists.append(list(zip(ids, scores)))

            if config.use_style_index:
                from app.services import style as style_service
                style_store = get_style_store(settings.embedding_version, settings.faiss_data_dir)
                if style_store.size > 0:
                    style_vec = await loop.run_in_executor(None, style_service.embed_image, pil_img)
                    s_ids, s_scores = style_store.search(style_vec, config.top_k_retrieve)
                    ranked_lists.append(list(zip(s_ids, s_scores)))

    # Text-to-image: embed each visual description
    for desc in visual_descriptions:
        loop = asyncio.get_event_loop()
        text_vec = await loop.run_in_executor(None, emb_service.embed_text, desc)
        ids, scores = clip_store.search(text_vec, config.top_k_retrieve)
        ranked_lists.append(list(zip(ids, scores)))

        # Style index search requires image features (Gram matrices), not text embeddings.
        # Style retrieval only runs when a reference image is provided (handled above).
    latency["vector"] = _elapsed(t)

    # 5. Fusion
    t = _tick()
    if not ranked_lists:
        return {"results": [], "rewritten_query": rewritten, "latency_ms": latency}

    if config.fusion_method == "rrf" and len(ranked_lists) > 1:
        fused = _rrf_fusion(ranked_lists)
    elif config.fusion_method == "weighted" and len(ranked_lists) > 1:
        fused = _weighted_fusion(ranked_lists)
    else:
        fused = ranked_lists[0]
    latency["fusion"] = _elapsed(t)

    candidate_ids = [doc_id for doc_id, _ in fused]
    candidate_scores = {doc_id: score for doc_id, score in fused}

    # Apply metadata filters
    t = _tick()
    if config.use_filters and filters:
        candidate_ids = _apply_filters(candidate_ids, filters, db)
    latency["filter"] = _elapsed(t)

    # 6. Reranker
    t = _tick()
    if config.use_reranker and candidate_ids:
        # Fetch captions for reranker input
        from app.models.source import Image as ImageModel
        from app.services.reranker import RerankerCandidate, rerank

        id_uuids = [uuid.UUID(i) for i in candidate_ids[:config.top_k_retrieve]]
        img_rows = db.query(ImageModel).filter(ImageModel.id.in_(id_uuids)).all()
        caption_map = {str(r.id): (r.caption or "") for r in img_rows}

        candidates = [
            RerankerCandidate(
                image_id=iid,
                caption=caption_map.get(iid, ""),
                original_score=candidate_scores.get(iid, 0.0),
            )
            for iid in candidate_ids[:config.top_k_retrieve]
        ]
        loop = asyncio.get_event_loop()
        reranked = await loop.run_in_executor(
            None,
            rerank,
            query,
            candidates,
            settings.reranker_model,
            32,
        )
        candidate_ids = [iid for iid, _ in reranked]
        candidate_scores = {iid: score for iid, score in reranked}
    latency["rerank"] = _elapsed(t)

    # 7. MMR diversity reranking
    t = _tick()
    if config.use_mmr and len(candidate_ids) > 1:
        top_ids = candidate_ids[: config.top_k_final * 3]
        from app.services import embedder as emb_service

        # Re-embed query for MMR cosine computations
        loop = asyncio.get_event_loop()
        q_vec = await loop.run_in_executor(None, emb_service.embed_text, query)

        # Fetch candidate embeddings by re-encoding captions (proxy for image embeddings)
        # In production these would be stored and retrieved from the FAISS index.
        from app.models.source import Image as ImageModel

        id_uuids = [uuid.UUID(i) for i in top_ids]
        img_rows = db.query(ImageModel).filter(ImageModel.id.in_(id_uuids)).all()
        caption_map = {str(r.id): (r.caption or r.sha256) for r in img_rows}

        captions = [caption_map.get(iid, iid) for iid in top_ids]
        loop = asyncio.get_event_loop()
        cand_vecs = await loop.run_in_executor(None, emb_service.embed_texts, captions)

        from app.services.mmr import mmr as mmr_fn

        top_scores = [candidate_scores.get(iid, 0.0) for iid in top_ids]
        mmr_results = mmr_fn(
            query_embedding=q_vec,
            candidate_embeddings=cand_vecs,
            candidate_ids=top_ids,
            scores=top_scores,
            top_k=config.top_k_final,
            lambda_=config.mmr_lambda,
        )
        candidate_ids = [iid for iid, _ in mmr_results]
        candidate_scores = {iid: score for iid, score in mmr_results}
    latency["mmr"] = _elapsed(t)

    final_ids = candidate_ids[: config.top_k_final]

    # Fetch metadata for final results
    meta_map = _fetch_result_metadata(final_ids, db)

    # 8. Synthesizer
    t = _tick()
    explanations: list[str] = [""] * len(final_ids)

    if config.use_grounded_synthesis and final_ids:
        result_dicts = []
        for iid in final_ids:
            row = meta_map.get(iid, {})
            building = row.get("building")
            source = row.get("source")
            result_dicts.append({
                "metadata": _building_to_dict(building),
                "source_excerpt": source.text_excerpt if source else "",
            })
        from app.services import agents
        loop = asyncio.get_event_loop()
        explanations = await loop.run_in_executor(None, agents.synthesize, query, result_dicts)
    latency["synth"] = _elapsed(t)

    # 9. Build final result list
    results: list[dict[str, Any]] = []
    for i, iid in enumerate(final_ids):
        row = meta_map.get(iid, {})
        building = row.get("building")
        source = row.get("source")
        image_obj = row.get("image")

        results.append({
            "building_id": str(building.id) if building else None,
            "image_id": iid,
            "score": round(candidate_scores.get(iid, 0.0), 4),
            "explanation": explanations[i] if i < len(explanations) else "",
            "metadata": _building_to_dict(building),
            "source": {
                "url": source.url if source else None,
                "license": (image_obj.license if image_obj else (source.license if source else None)),
                "photographer": image_obj.photographer if image_obj else None,
                "license_url": image_obj.license_url if image_obj else None,
            },
        })

    latency["total"] = _elapsed(t_total)

    return {
        "results": results,
        "rewritten_query": rewritten,
        "latency_ms": latency,
    }


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
