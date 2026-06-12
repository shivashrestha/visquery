"""Automated tag validation — cross-signal trust, no human review queue.

Runs after artifact extraction in the ingest chain. Verifies VLM tags via
three independent signals:
  a. VLM self-consistency  — style.confidence from the extractor output
  b. CLIP zero-shot        — cosine of the stored image vector vs text prompts
                             built from the extracted tags
  c. Neighbor consensus    — top-k CLIP neighbors voting on style/building_type
                             (skipped, signal = null, when the index is small)

Decision (thresholds in app.config.Settings):
  verified     — VLM confidence ≥ tag_vlm_confidence_min AND
                 (CLIP style agreement ≥ tag_clip_agreement_min OR neighbor
                 consensus passes)
  quarantined  — hard disagreement: CLIP score below tag_clip_floor AND
                 neighbors available with ≤1 vote → conflicting tag stripped,
                 originals logged in tag_signals
  provisional  — everything in between; tags kept, searchable, small score
                 penalty applied in /api/search ranking

Quarantine triggers one self-correction pass: the extractor re-runs with the
disagreement injected into the prompt. The second pass is re-scored with the
same rule; whatever it yields is final (one retry max).

Constraint: this module loads no models of its own — it reuses the CLIP
embedder singleton and the FAISS index already used by the search service.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

logger = structlog.get_logger()


def enqueue_tag_validation(settings: Any, image_id: str) -> Optional[str]:
    """Best-effort RQ enqueue. Returns job id, or None if Redis unavailable."""
    if not settings.redis_url:
        return None
    try:
        import redis
        from rq import Queue

        q = Queue("ingest", connection=redis.from_url(settings.redis_url))
        job = q.enqueue(validate_image_tags, image_id, job_timeout=300)
        return job.id
    except Exception as exc:
        logger.warning("tag_validation_enqueue_failed", image_id=image_id, error=str(exc))
        return None


def _norm(label: str) -> str:
    return (label or "").strip().lower().replace("_", " ")


def _clip_prompts(style: str, building_type: str, materials: list[str]) -> dict[str, str]:
    """One prompt per tag, keyed by tag name."""
    prompts: dict[str, str] = {}
    if style:
        btype = building_type if building_type else ""
        prompts[f"style:{style}"] = f"a photo of a {_norm(style)} {_norm(btype)} building".replace("  ", " ")
    if building_type:
        prompts[f"building_type:{building_type}"] = f"a photo of a {_norm(building_type)} building"
    for m in materials:
        if m:
            prompts[f"material:{m}"] = f"a photo of a building made of {_norm(m)}"
    return prompts


def compute_signals(
    image_id: str,
    artifacts: dict[str, Any],
    image_vec,
    settings: Any,
    db,
) -> dict[str, Any]:
    """Compute the three validation signals. Pure read — no DB writes."""
    import numpy as np

    from app.services.embedder import embed_texts
    from app.services.vector_store import get_clip_store

    style_obj = artifacts.get("style") if isinstance(artifacts.get("style"), dict) else {}
    style = style_obj.get("primary") or ""
    building_type = artifacts.get("building_type") or ""
    materials = [m for m in (artifacts.get("materials") or []) if isinstance(m, str)]

    signals: dict[str, Any] = {
        "vlm_confidence": float(style_obj.get("confidence") or 0.0),
        "clip": {},
        "neighbors": None,
    }

    # ── b. CLIP zero-shot agreement ──
    prompts = _clip_prompts(style, building_type, materials)
    if prompts and image_vec is not None:
        keys = list(prompts.keys())
        text_vecs = embed_texts([prompts[k] for k in keys])
        scores = (text_vecs @ np.asarray(image_vec, dtype=np.float32)).tolist()
        signals["clip"] = {k: round(float(s), 4) for k, s in zip(keys, scores)}

    # ── c. Neighbor consensus ──
    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    if clip_store.size >= settings.tag_neighbor_min_corpus and image_vec is not None:
        from app.models.source import Image

        neighbor_ids, _ = clip_store.search(
            np.asarray(image_vec, dtype=np.float32), settings.tag_neighbor_k + 1
        )
        neighbor_ids = [n for n in neighbor_ids if n != image_id][: settings.tag_neighbor_k]

        style_votes = 0
        btype_votes = 0
        if neighbor_ids:
            rows = (
                db.query(Image.artifacts_json, Image.metadata_json)
                .filter(Image.id.in_([uuid.UUID(n) for n in neighbor_ids]))
                .all()
            )
            for art, meta in rows:
                n_style = ""
                n_btype = ""
                if isinstance(art, dict):
                    n_style = (art.get("style") or {}).get("primary") or ""
                    n_btype = art.get("building_type") or ""
                if not n_btype and isinstance(meta, dict):
                    n_btype = meta.get("building_type") or ""
                if style and _norm(n_style) == _norm(style):
                    style_votes += 1
                if building_type and _norm(n_btype) == _norm(building_type):
                    btype_votes += 1

        consensus_min = settings.tag_neighbor_consensus_min
        signals["neighbors"] = {
            "k": len(neighbor_ids),
            "style_votes": style_votes,
            "building_type_votes": btype_votes,
            "style_pass": style_votes >= consensus_min,
            "building_type_pass": btype_votes >= consensus_min,
        }

    return signals


def decide(signals: dict[str, Any], artifacts: dict[str, Any], settings: Any) -> tuple[str, list[str]]:
    """Apply the decision rule. Returns (status, conflicting_tags_to_strip)."""
    style_obj = artifacts.get("style") if isinstance(artifacts.get("style"), dict) else {}
    style = style_obj.get("primary") or ""
    building_type = artifacts.get("building_type") or ""

    vlm_conf = signals["vlm_confidence"]
    clip = signals.get("clip") or {}
    neighbors = signals.get("neighbors")

    clip_style = clip.get(f"style:{style}") if style else None
    clip_btype = clip.get(f"building_type:{building_type}") if building_type else None

    def neighbor_pass(field: str) -> Optional[bool]:
        if neighbors is None:
            return None
        return bool(neighbors.get(f"{field}_pass"))

    def neighbor_votes(field: str) -> Optional[int]:
        if neighbors is None:
            return None
        return int(neighbors.get(f"{field}_votes", 0))

    # Hard disagreement per tag: CLIP near floor AND neighbors actively reject
    stripped: list[str] = []
    for tag, clip_score, field in (
        (style, clip_style, "style"),
        (building_type, clip_btype, "building_type"),
    ):
        if not tag or clip_score is None:
            continue
        votes = neighbor_votes(field)
        if clip_score < settings.tag_clip_floor and votes is not None and votes <= 1:
            stripped.append(f"{field}:{tag}")

    if stripped:
        return "quarantined", stripped

    # Verified: VLM confident AND at least one external signal agrees on style
    clip_agrees = clip_style is not None and clip_style >= settings.tag_clip_agreement_min
    if vlm_conf >= settings.tag_vlm_confidence_min and (clip_agrees or neighbor_pass("style")):
        return "verified", []

    return "provisional", []


def _strip_conflicting_tags(row, artifacts: dict[str, Any], stripped: list[str]) -> dict[str, Any]:
    """Remove only the conflicting tags; keep everything else searchable."""
    artifacts = dict(artifacts)
    for entry in stripped:
        field, _, tag = entry.partition(":")
        if field == "style":
            style_obj = dict(artifacts.get("style") or {})
            style_obj["primary"] = ""
            artifacts["style"] = style_obj
            artifacts.pop("architecture_style_classified", None)
            row.tags = [t for t in (row.tags or []) if _norm(t) != _norm(tag)]
            meta = dict(row.metadata_json or {})
            if _norm(meta.get("architecture_style_classified", "")) == _norm(tag):
                meta["architecture_style_classified"] = ""
            row.metadata_json = meta
        elif field == "building_type":
            artifacts["building_type"] = ""
            meta = dict(row.metadata_json or {})
            if _norm(meta.get("building_type", "")) == _norm(tag):
                meta["building_type"] = ""
            row.metadata_json = meta
    return artifacts


def _retry_instruction(stripped: list[str], signals: dict[str, Any]) -> str:
    parts = []
    for entry in stripped:
        field, _, tag = entry.partition(":")
        neighbors = signals.get("neighbors") or {}
        votes = neighbors.get(f"{field}_votes")
        clip_score = (signals.get("clip") or {}).get(entry)
        parts.append(
            f"CLIP zero-shot scoring (score={clip_score}) and corpus neighbor consensus "
            f"({votes} of {neighbors.get('k', '?')} neighbors agree) suggest this building "
            f"is NOT '{tag}' ({field}). Re-examine the visual evidence carefully before "
            f"assigning {field}."
        )
    return "\n".join(parts)


def validate_image_tags(image_id: str) -> dict[str, Any]:
    """RQ job: validate one image's tags via cross-signal agreement."""
    import numpy as np
    import sqlalchemy as sa
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings
    from app.services.vector_store import get_clip_store

    settings = get_settings()
    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        from app.models.source import Image

        row = db.query(Image).filter(Image.id == uuid.UUID(image_id)).first()
        if row is None:
            return {"status": "not_found", "image_id": image_id}

        log = logger.bind(image_id=image_id)
        artifacts = row.artifacts_json or {}
        building_type = artifacts.get("building_type") or ""

        if not artifacts or building_type == "not_applicable":
            log.info("tag_validation_skipped", reason="no_artifacts_or_not_applicable")
            return {"status": "skipped", "image_id": image_id}

        # Reuse stored FAISS vector — never re-embed unless missing
        clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
        vec = clip_store.get_vector(image_id)
        if vec is None:
            try:
                from app.services.embedder import embed_image_from_path
                from app.workers.ingest_worker import _resolve_storage_path

                vec = embed_image_from_path(_resolve_storage_path(row.storage_path, settings))
            except Exception as exc:
                log.warning("tag_validation_no_vector", error=str(exc))
                vec = None

        signals = compute_signals(image_id, artifacts, vec, settings, db)
        status, stripped = decide(signals, artifacts, settings)
        retry_log: Optional[dict] = None

        # ── Self-correction: one VLM retry with the disagreement injected ──
        if status == "quarantined" and stripped:
            log.info("tag_validation_retry", stripped=stripped)
            try:
                from app.workers.captioner import extract_image_artifacts
                from app.workers.ingest_worker import _resolve_storage_path

                second = extract_image_artifacts(
                    _resolve_storage_path(row.storage_path, settings),
                    settings,
                    image_vec=np.asarray(vec, dtype=np.float32) if vec is not None else None,
                    enrich_style=True,
                    extra_instruction=_retry_instruction(stripped, signals),
                )
                second.pop("title", None)
                second.pop("method", None)
                if second and not second.get("parse_error") and not second.get("vlm_unavailable"):
                    second_signals = compute_signals(image_id, second, vec, settings, db)
                    second_status, second_stripped = decide(second_signals, second, settings)
                    retry_log = {
                        "second_style": (second.get("style") or {}).get("primary"),
                        "second_building_type": second.get("building_type"),
                        "second_status": second_status,
                    }
                    # Second pass is final — one retry max
                    artifacts, signals = second, second_signals
                    status, stripped = second_status, second_stripped
                    row.artifacts_json = second
                    new_style = (second.get("style") or {}).get("primary") or ""
                    if new_style:
                        row.tags = [new_style]
                    meta = dict(row.metadata_json or {})
                    meta["building_type"] = second.get("building_type") or meta.get("building_type", "")
                    meta["architecture_style_classified"] = new_style
                    row.metadata_json = meta
                    row.materials = second.get("materials") or row.materials
            except Exception as exc:
                log.warning("tag_validation_retry_failed", error=str(exc))

        if status == "quarantined" and stripped:
            row.artifacts_json = _strip_conflicting_tags(row, artifacts, stripped)

        signals["decision"] = status
        signals["stripped"] = stripped
        signals["retry"] = retry_log
        signals["validated_at"] = datetime.now(timezone.utc).isoformat()

        row.tag_status = status
        row.tag_signals = signals
        db.commit()
        log.info("tag_validation_done", status=status, stripped=stripped)

    return {"status": status, "image_id": image_id, "stripped": stripped}
