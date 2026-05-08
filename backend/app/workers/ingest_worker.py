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
            caption_text = caption_data.get("summary", "")
            caption_method = caption_data.get("method", "")
        except Exception as exc:
            log.warning("ingest_caption_failed", error=str(exc))
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
        except Exception as exc:
            log.warning("ingest_metadata_failed", error=str(exc))

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
