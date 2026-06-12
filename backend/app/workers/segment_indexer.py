"""Segment indexer — component-level CLIP index per ingested image.

For each image: FastSAM region extraction (reusing the hybrid pipeline pieces
from app.routers.segment), CLIP-embed each region crop, classify against the
architectural label vocabulary, then persist:
  - image_segments rows (Postgres, embedding included for FAISS rebuilds)
  - crop JPEGs under {storage_root}/segments/{image_id}/
  - vectors in the `segments` FAISS index (search copy)

Constraints:
  - max MAX_SEGMENTS_PER_IMAGE segments, largest mask_area_ratio first
  - segments under MIN_SEGMENT_AREA of image area are skipped
  - non-architectural regions (sky, vegetation, people, vehicles) are skipped

Models are lazy-loaded via the same singletons (with idle eviction) used by
the /segment endpoints, so the RQ worker shares one copy in its process.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

MAX_SEGMENTS_PER_IMAGE = 12
MIN_SEGMENT_AREA = 0.02  # 2% of image area


def enqueue_segment_indexing(settings: Any, image_id: str) -> Optional[str]:
    """Best-effort RQ enqueue. Returns job id, or None if Redis unavailable."""
    if not settings.redis_url:
        return None
    try:
        import redis
        from rq import Queue

        q = Queue("ingest", connection=redis.from_url(settings.redis_url))
        job = q.enqueue(index_image_segments, image_id, job_timeout=600)
        return job.id
    except Exception as exc:
        logger.warning("segment_enqueue_failed", image_id=image_id, error=str(exc))
        return None


def _mask_area_ratio(region: dict) -> float:
    """Fraction of image pixels covered by the region mask (160×160 proto)."""
    import numpy as np

    arr = np.array(region["mask_pil"])
    return float((arr > 127).mean())


def index_image_segments(image_id: str) -> dict[str, Any]:
    """RQ job: extract, embed, and index segments for one ingested image.

    Idempotent — returns early if the image already has segment rows.
    """
    import numpy as np
    import sqlalchemy as sa
    import torch
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings
    from app.models.segment import ImageSegment
    from app.models.source import Image
    from app.routers.segment import (
        CLIP_LOGIT_SCALE,
        CLIP_MIN_CONF,
        _CLIP_DISPLAYS,
        _fastsam_regions,
        _get_clip,
    )
    from app.services.vector_store import get_segment_store
    from app.workers.ingest_worker import _resolve_storage_path

    settings = get_settings()
    log = logger.bind(image_id=image_id)

    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        row = db.query(Image).filter(Image.id == uuid.UUID(image_id)).first()
        if row is None:
            return {"status": "not_found", "image_id": image_id}

        existing = (
            db.query(ImageSegment.id)
            .filter(ImageSegment.image_id == uuid.UUID(image_id))
            .first()
        )
        if existing is not None:
            log.info("segment_index_skipped_existing")
            return {"status": "exists", "image_id": image_id}

        path = Path(_resolve_storage_path(row.storage_path, settings))
        if not path.exists():
            log.warning("segment_index_file_missing", path=str(path))
            return {"status": "file_missing", "image_id": image_id}
        raw = path.read_bytes()

    # ── FastSAM regions (outside DB session — inference is slow) ─────────
    _, regions = _fastsam_regions(raw)
    for reg in regions:
        reg["mask_area"] = _mask_area_ratio(reg)
    regions = [r for r in regions if r["mask_area"] >= MIN_SEGMENT_AREA]
    regions.sort(key=lambda r: r["mask_area"], reverse=True)
    regions = regions[:MAX_SEGMENTS_PER_IMAGE]
    if not regions:
        log.info("segment_index_no_regions")
        return {"status": "ok", "image_id": image_id, "segments": 0}

    # ── CLIP: one batched forward pass = embeddings + labels ─────────────
    clip_m, preprocess, text_feats = _get_clip()
    tensors = torch.stack([preprocess(r["crop_pil"]) for r in regions])
    with torch.inference_mode():
        img_feats = clip_m.encode_image(tensors)
        img_feats = img_feats / img_feats.norm(dim=-1, keepdim=True)
        probs = (CLIP_LOGIT_SCALE * img_feats @ text_feats.T).softmax(dim=-1)
    embeddings = img_feats.numpy().astype(np.float32)

    kept: list[dict] = []
    for reg, vec, prob_row in zip(regions, embeddings, probs):
        best_idx = int(prob_row.argmax())
        best_conf = float(prob_row[best_idx])
        display = _CLIP_DISPLAYS[best_idx] if best_conf >= CLIP_MIN_CONF else None
        if display is None:
            # Non-architectural or low confidence — keep out of the component corpus
            continue
        kept.append({"region": reg, "vec": vec, "label": display})

    if not kept:
        log.info("segment_index_all_filtered", regions=len(regions))
        return {"status": "ok", "image_id": image_id, "segments": 0}

    # ── Persist crops + rows + FAISS vectors ──────────────────────────────
    crops_dir = Path(settings.storage_root) / "segments" / image_id
    crops_dir.mkdir(parents=True, exist_ok=True)

    seg_ids: list[str] = []
    vectors: list[np.ndarray] = []

    with Session() as db:
        for i, item in enumerate(kept):
            reg = item["region"]
            seg_id = uuid.uuid4()
            crop_path = crops_dir / f"{i}.jpg"
            try:
                reg["crop_pil"].convert("RGB").save(crop_path, format="JPEG", quality=85)
            except Exception as exc:
                log.warning("segment_crop_write_failed", error=str(exc))
                crop_path = None

            db.add(ImageSegment(
                id=seg_id,
                image_id=uuid.UUID(image_id),
                label=item["label"],
                bbox_x=round(float(reg["x1n"]), 4),
                bbox_y=round(float(reg["y1n"]), 4),
                bbox_w=round(float(reg["x2n"] - reg["x1n"]), 4),
                bbox_h=round(float(reg["y2n"] - reg["y1n"]), 4),
                mask_area_ratio=round(float(reg["mask_area"]), 4),
                clip_embedding=[float(v) for v in item["vec"]],
                crop_path=str(crop_path) if crop_path else None,
            ))
            seg_ids.append(str(seg_id))
            vectors.append(item["vec"])

        db.flush()
        try:
            store = get_segment_store(settings.embedding_version, settings.faiss_data_dir)
            store.add(np.stack(vectors), seg_ids)
        except Exception as exc:
            db.rollback()
            log.error("segment_faiss_add_failed", error=str(exc))
            raise
        db.commit()

    log.info("segment_index_complete", segments=len(seg_ids))
    return {"status": "ok", "image_id": image_id, "segments": len(seg_ids)}
