"""RQ ingest worker.

Receives image + metadata from the scraper pipeline and runs:
  1. Embedder — CLIP (computed once, reused for style classification + FAISS)
  2. Captioner — VLM generates {title, description, raw_text}
  3. Metadata extractor — structured building fields
  4. Index update — adds vectors to FAISS
"""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any, Optional

import structlog

logger = structlog.get_logger()


def _resolve_storage_path(storage_path: str, settings) -> str:
    """Resolve a stored path against the current storage_root.

    Handles cases where storage was remounted (e.g., /app/storage → /data).
    """
    p = Path(storage_path)
    if p.exists():
        return storage_path
    storage_root = Path(settings.storage_root)
    parts = p.parts
    for i, part in enumerate(parts):
        if part in ("images", "metadata"):
            candidate = storage_root / Path(*parts[i:])
            if candidate.exists():
                return str(candidate)
    return storage_path


def _write_metadata_json(settings, image_id: str, meta: dict) -> None:
    try:
        metadata_dir = Path(settings.storage_root) / "metadata"
        metadata_dir.mkdir(parents=True, exist_ok=True)
        (metadata_dir / f"{image_id}.json").write_text(
            json.dumps(meta, ensure_ascii=False, default=str), encoding="utf-8"
        )
    except Exception as exc:
        logger.warning("metadata_json_write_failed", image_id=image_id, error=str(exc))


def _build_tags(caption_data: dict, building_meta: dict) -> list[str]:
    classified = caption_data.get("architecture_style_classified") or ""
    style_top = caption_data.get("architecture_style_top") or []
    style_tags = [s for s, _ in style_top[:3]] if style_top else ([classified] if classified else [])
    material_tags = building_meta.get("materials") or []
    typology_tags = building_meta.get("typology") or []
    return list(dict.fromkeys(style_tags + material_tags + typology_tags))


def complete_image_metadata(image_id: str) -> dict[str, Any]:
    """Background job: CLIP embed (if needed) + VLM caption + structured metadata extraction."""
    from app.config import get_settings
    from app.workers.captioner import caption_image
    from app.workers.metadata_extractor import extract_building_metadata

    import sqlalchemy as sa
    from sqlalchemy.orm import sessionmaker

    settings = get_settings()
    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        from app.models.source import Image

        row = db.query(Image).filter(Image.id == uuid.UUID(image_id)).first()
        if row is None:
            return {"status": "not_found", "image_id": image_id}

        log = logger.bind(image_id=image_id)

        resolved_path = _resolve_storage_path(row.storage_path, settings)
        if resolved_path != row.storage_path:
            log.info("storage_path_remapped", old=row.storage_path, new=resolved_path)
            row.storage_path = resolved_path

        # CLIP embed + FAISS index (for images ingested via scraper direct-insert path)
        if row.ingest_status == "processing":
            try:
                import numpy as np
                from app.services.embedder import embed_image_from_path
                from app.services.vector_store import get_clip_store
                vec = embed_image_from_path(resolved_path)
                clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
                clip_store.add(vec[np.newaxis, :], [image_id])
                log.info("clip_indexed", image_id=image_id)
            except Exception as exc:
                log.warning("clip_index_failed", error=str(exc))

        log.info("captioning_start", storage_path=row.storage_path)
        try:
            caption_data = caption_image(row.storage_path, settings)
            log.info("captioning_done", title=caption_data.get("title", ""))
        except Exception as exc:
            log.warning("captioning_failed", error=str(exc))
            caption_data = {}

        building_meta: dict = {}
        try:
            source_text = (row.metadata_json or {}).get("text_excerpt", "") if row.metadata_json else ""
            building_meta = extract_building_metadata(
                text_excerpt=source_text,
                caption_json=caption_data,
                wikidata={},
                settings=settings,
            )
            log.info("metadata_extracted", name=building_meta.get("name"))
        except Exception as exc:
            log.warning("metadata_extraction_failed", error=str(exc))

        full_meta = {**caption_data, **building_meta}

        # Core caption fields
        row.caption        = caption_data.get("title", "")
        row.caption_method = caption_data.get("method", "")
        row.tags           = _build_tags(caption_data, building_meta)
        row.metadata_json  = full_meta
        row.metadata_ready = True
        row.ingest_status  = "ready"

        # Structured metadata columns
        row.name             = building_meta.get("name") or caption_data.get("title")
        row.architect        = building_meta.get("architect")
        row.year_built       = building_meta.get("year_built")
        row.location_country = building_meta.get("location_country")
        row.location_city    = building_meta.get("location_city")
        row.typology         = building_meta.get("typology") or []
        row.materials        = building_meta.get("materials") or []
        row.structural_system= building_meta.get("structural_system")
        row.climate_zone     = building_meta.get("climate_zone")
        row.description      = building_meta.get("description")

        _write_metadata_json(settings, image_id, {
            "filename": Path(row.storage_path).name,
            **full_meta,
        })

        db.commit()
        log.info("pipeline_complete", image_id=image_id, title=row.caption)

    return {"status": "ok", "image_id": image_id}


def ingest_image(
    storage_path: str,
    source_url: str,
    source_title: str,
    source_license: str,
    spider_name: str,
    photographer: Optional[str] = None,
    license_url: Optional[str] = None,
    raw_text_excerpt: str = "",
    wikidata: Optional[dict] = None,
) -> dict[str, Any]:
    """Main RQ job function. Returns a dict with image_id and status."""
    from app.config import get_settings
    from app.services.embedder import embed_image_from_path
    from app.services.vector_store import get_clip_store
    from app.workers.captioner import caption_image

    import numpy as np
    import sqlalchemy as sa
    from sqlalchemy.orm import sessionmaker

    settings = get_settings()
    log = logger.bind(storage_path=storage_path, spider=spider_name)

    path = Path(storage_path)
    if not path.exists():
        log.error("ingest_file_missing")
        raise FileNotFoundError(storage_path)

    sha256 = hashlib.sha256(path.read_bytes()).hexdigest()

    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        from app.models.source import Image

        existing = db.query(Image).filter(Image.sha256 == sha256).first()
        if existing:
            log.info("ingest_duplicate_skipped", sha256=sha256)
            return {"status": "duplicate", "image_id": str(existing.id)}

        log.info("ingest_embedding")
        try:
            vec = embed_image_from_path(storage_path)
        except Exception as exc:
            log.error("ingest_embedding_failed", error=str(exc))
            raise

        log.info("ingest_captioning")
        try:
            caption_data = caption_image(storage_path, settings, image_vec=vec)
        except Exception as exc:
            log.warning("ingest_caption_failed", error=str(exc))
            caption_data = {}

        title = caption_data.get("title", "")
        classified = caption_data.get("architecture_style_classified") or ""
        tags = [classified] if classified else []

        width, height = None, None
        try:
            from PIL import Image as PILImage
            with PILImage.open(path) as pil_img:
                width, height = pil_img.size
        except Exception:
            pass

        image_id = uuid.uuid4()
        image = Image(
            id=image_id,
            storage_path=storage_path,
            sha256=sha256,
            width=width,
            height=height,
            caption=title,
            caption_method=caption_data.get("method", ""),
            photographer=photographer,
            license=source_license,
            license_url=license_url,
            source_url=source_url,
            source_title=source_title,
            source_spider=spider_name,
            embedding_version=settings.embedding_version,
            metadata_json={**caption_data, "text_excerpt": raw_text_excerpt},
            tags=tags,
        )
        db.add(image)
        db.flush()

        try:
            clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
            clip_store.add(vec[np.newaxis, :], [str(image_id)])
        except Exception as exc:
            log.error("ingest_faiss_add_failed", error=str(exc))
            db.rollback()
            raise

        _write_metadata_json(settings, str(image_id), {
            "filename": path.name,
            **caption_data,
        })

        db.commit()
        log.info("ingest_complete", image_id=str(image_id), title=title)
        return {"status": "ok", "image_id": str(image_id)}
