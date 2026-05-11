"""RQ ingest worker.

Receives image + metadata from the scraper pipeline and runs:
  1. Captioner — vision LLM generates structured caption JSON
  2. Embedder — CLIP + (optionally) style embedding
  3. Index update — adds vectors to FAISS and persists id_map

Enqueued jobs are small dicts; heavy models are singletons loaded once per
worker process and reused across jobs.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any, Optional

import structlog

logger = structlog.get_logger()


def _write_metadata_json(settings, image_id: str, meta: dict) -> None:
    try:
        metadata_dir = Path(settings.storage_root) / "metadata"
        metadata_dir.mkdir(parents=True, exist_ok=True)
        (metadata_dir / f"{image_id}.json").write_text(
            json.dumps(meta, ensure_ascii=False, default=str), encoding="utf-8"
        )
    except Exception as exc:
        logger.warning("metadata_json_write_failed", image_id=image_id, error=str(exc))


def complete_image_metadata(image_id: str) -> dict[str, Any]:
    """Background job: caption + metadata enrichment for an already embedded image."""
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

        # Caption — let exception propagate so RQ marks job failed (visible via /jobs/{id})
        log = logger.bind(image_id=image_id)
        log.info("captioning_start", storage_path=row.storage_path)
        caption_data = caption_image(row.storage_path, settings)
        row.caption = caption_data.get("caption", "")
        row.caption_method = caption_data.get("method", "")
        log.info("captioning_done", caption_len=len(row.caption or ""))

        # Store full VLM metadata on the image record
        row.metadata_json = caption_data
        classified = caption_data.get("architecture_style_classified") or ""
        row.tags = list(dict.fromkeys(
            ([classified] if classified else [])
            + (caption_data.get("tags") or [])
            + (caption_data.get("architectural_style") or [])
            + (caption_data.get("materials") or [])
            + (caption_data.get("program_hints") or [])
        ))
        log.info("metadata_done", tags=row.tags)

        full_meta = {
            "filename": Path(row.storage_path).name,
            **caption_data,
        }

        # Best-effort building metadata extraction
        try:
            meta = extract_building_metadata(
                text_excerpt=row.caption or "",
                caption_json=caption_data,
                wikidata={},
                settings=settings,
            )
            full_meta["building"] = meta
            log.info("building_metadata_done", meta_keys=list(meta.keys()))
        except Exception as exc:
            log.error("bg_metadata_failed", error=str(exc))

        _write_metadata_json(settings, image_id, full_meta)

        row.metadata_ready = True
        row.ingest_status = "ready"
        db.commit()
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
    """Main RQ job function.

    Returns a dict with image_id, building_id (may be None), and status.
    """
    from app.config import get_settings
    from app.services.embedder import embed_image_from_path
    from app.services.vector_store import get_clip_store
    from app.workers.captioner import caption_image
    from app.workers.metadata_extractor import extract_building_metadata

    import numpy as np
    import sqlalchemy as sa
    from sqlalchemy.orm import sessionmaker

    settings = get_settings()
    log = logger.bind(storage_path=storage_path, spider=spider_name)

    # Compute SHA-256 for deduplication
    path = Path(storage_path)
    if not path.exists():
        log.error("ingest_file_missing")
        raise FileNotFoundError(storage_path)

    sha256 = hashlib.sha256(path.read_bytes()).hexdigest()

    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        from app.models.source import Image, Source

        # Skip duplicates
        existing = db.query(Image).filter(Image.sha256 == sha256).first()
        if existing:
            log.info("ingest_duplicate_skipped", sha256=sha256)
            return {"status": "duplicate", "image_id": str(existing.id)}

        # Ensure source row
        source = db.query(Source).filter(Source.url == source_url).first()
        if source is None:
            source = Source(
                id=uuid.uuid4(),
                url=source_url,
                title=source_title,
                license=source_license,
                text_excerpt=raw_text_excerpt,
                spider_name=spider_name,
            )
            db.add(source)
            db.flush()

        # Caption via vision LLM
        log.info("ingest_captioning")
        try:
            caption_data = caption_image(storage_path, settings)
            caption_text = caption_data.get("caption", "")
            caption_method = caption_data.get("method", "")
        except Exception as exc:
            log.warning("ingest_caption_failed", error=str(exc))
            caption_data = {}
            caption_text = ""
            caption_method = "failed"

        # Image dimensions
        width, height = None, None
        try:
            from PIL import Image as PILImage
            with PILImage.open(path) as pil_img:
                width, height = pil_img.size
        except Exception:
            pass

        # Create image record
        image_id = uuid.uuid4()
        classified = caption_data.get("architecture_style_classified") or ""
        vlm_tags = list(dict.fromkeys(
            ([classified] if classified else [])
            + (caption_data.get("tags") or [])
            + (caption_data.get("architectural_style") or [])
            + (caption_data.get("materials") or [])
            + (caption_data.get("program_hints") or [])
        ))
        image = Image(
            id=image_id,
            storage_path=storage_path,
            sha256=sha256,
            width=width,
            height=height,
            caption=caption_text,
            caption_method=caption_method,
            photographer=photographer,
            license=source_license,
            license_url=license_url,
            source_id=source.id,
            embedding_version=settings.embedding_version,
            metadata_json=caption_data,
            tags=vlm_tags,
        )
        db.add(image)
        db.flush()

        # Embed and index
        log.info("ingest_embedding")
        try:
            vec = embed_image_from_path(storage_path)
            vec = vec[np.newaxis, :]
            clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
            clip_store.add(vec, [str(image_id)])
        except Exception as exc:
            log.error("ingest_embedding_failed", error=str(exc))
            db.rollback()
            raise

        # Extract building metadata
        full_meta = {
            "filename": path.name,
            **caption_data,
        }
        log.info("ingest_metadata_extraction")
        try:
            meta = extract_building_metadata(
                text_excerpt=raw_text_excerpt,
                caption_json=caption_data if caption_text else {},
                wikidata=wikidata or {},
                settings=settings,
            )
            building = _upsert_building(db, meta, settings.embedding_version)
            image.building_id = building.id
            full_meta["building"] = meta
        except Exception as exc:
            log.warning("ingest_metadata_failed", error=str(exc))
        _write_metadata_json(settings, str(image_id), full_meta)

        db.commit()
        log.info("ingest_complete", image_id=str(image_id))
        return {"status": "ok", "image_id": str(image_id)}


def _upsert_building(db, meta: dict[str, Any], embedding_version: str):
    """Find or create a building record from extracted metadata."""
    from app.models.building import Building

    # Match by name + architect + year (fuzzy but deterministic)
    q = db.query(Building)
    if meta.get("name"):
        q = q.filter(Building.name == meta["name"])
    if meta.get("architect"):
        q = q.filter(Building.architect == meta["architect"])
    if meta.get("year_built"):
        q = q.filter(Building.year_built == meta["year_built"])

    existing = q.first()
    if existing:
        return existing

    building = Building(
        id=uuid.uuid4(),
        name=meta.get("name", "Unknown"),
        architect=meta.get("architect"),
        year_built=meta.get("year_built"),
        location_country=meta.get("location_country"),
        location_city=meta.get("location_city"),
        typology=meta.get("typology"),
        materials=meta.get("materials"),
        structural_system=meta.get("structural_system"),
        climate_zone=meta.get("climate_zone"),
        description=meta.get("description"),
        embedding_version=embedding_version,
    )
    db.add(building)
    db.flush()
    return building
