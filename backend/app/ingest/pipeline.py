"""Per-image ingestion pipeline — VLM metadata extraction only.

Flow per image:
  1. SHA256 dedup — skip if already in DB
  2. VLM caption  — title, description, raw_text via Ollama
  3. LLM metadata — structured building fields via Ollama
  4. Write Image record to Postgres (ingest_status='processing')
  5. Write metadata JSON to disk
  6. Move image from raw_data/ to storage/images/

FAISS indexing is handled separately by the backend worker (complete_image_metadata).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif"}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _image_dimensions(path: Path) -> tuple[int | None, int | None]:
    try:
        from PIL import Image
        with Image.open(path) as img:
            return img.size
    except Exception:
        return None, None


def _write_metadata_json(settings, image_id: str, filename: str, meta: dict) -> None:
    try:
        metadata_dir = Path(settings.storage_root) / "metadata"
        metadata_dir.mkdir(parents=True, exist_ok=True)
        (metadata_dir / f"{image_id}.json").write_text(
            json.dumps({"filename": filename, **meta}, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("metadata_json_write_failed", image_id=image_id, error=str(exc))


def ingest_image(image_path: Path, settings) -> dict[str, Any]:
    """Run the VLM-only pipeline for a single image.

    Returns result dict with status, image_id, file.
    On success, moves image to storage/images/.
    Images are stored with ingest_status='processing' until
    the backend worker embeds and indexes them in FAISS.
    """
    import sqlalchemy as sa
    from sqlalchemy.orm import sessionmaker

    from app.workers.captioner import caption_image
    from app.workers.metadata_extractor import extract_building_metadata

    log = logger.bind(file=image_path.name)

    # ── 1. SHA256 dedup ──────────────────────────────────────────────
    sha256 = _sha256(image_path)
    log.info("ingest_start", sha256=sha256[:12])

    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        existing = db.execute(
            sa.text("SELECT id FROM images WHERE sha256 = :h"), {"h": sha256}
        ).first()
        if existing:
            log.info("ingest_duplicate_skipped", image_id=str(existing[0]))
            return {"status": "duplicate", "image_id": str(existing[0]), "file": image_path.name}

    # ── 2. VLM caption ───────────────────────────────────────────────
    log.info("ingest_captioning")
    try:
        caption_data = caption_image(str(image_path), settings, image_vec=None, classify_style=False)
        log.info("ingest_captioned", title=caption_data.get("title", "")[:60])
    except Exception as exc:
        log.warning("ingest_caption_failed", error=str(exc))
        caption_data = {}

    # ── 3. Structured metadata extraction ────────────────────────────
    log.info("ingest_metadata_extraction")
    try:
        building_meta = extract_building_metadata(
            text_excerpt="",
            caption_json=caption_data,
            wikidata={},
            settings=settings,
        )
        log.info("ingest_metadata_extracted", name=building_meta.get("name"))
    except Exception as exc:
        log.warning("ingest_metadata_failed", error=str(exc))
        building_meta = {}

    full_meta = {**caption_data, **building_meta}
    tags = list(dict.fromkeys(
        (building_meta.get("materials") or []) + (building_meta.get("typology") or [])
    ))

    # ── 4. Destination path ──────────────────────────────────────────
    dest_dir = Path(settings.storage_root) / "images"
    dest_dir.mkdir(parents=True, exist_ok=True)
    image_id = uuid.uuid4()
    dest_filename = f"{image_id}{image_path.suffix.lower()}"
    dest_path = dest_dir / dest_filename

    width, height = _image_dimensions(image_path)

    # ── 5. Write DB record ───────────────────────────────────────────
    with Session() as db:
        try:
            db.execute(
                sa.text("""
                    INSERT INTO images (
                        id, storage_path, sha256, width, height,
                        caption, caption_method, license,
                        embedding_version, metadata_json, tags,
                        ingest_status, metadata_ready,
                        name, architect, year_built,
                        location_country, location_city,
                        typology, materials, structural_system,
                        climate_zone, description,
                        source_url, source_title, source_spider
                    ) VALUES (
                        :id, :storage_path, :sha256, :width, :height,
                        :caption, :caption_method, :license,
                        :embedding_version, CAST(:metadata_json AS jsonb), :tags,
                        'processing', true,
                        :name, :architect, :year_built,
                        :location_country, :location_city,
                        :typology, :materials, :structural_system,
                        :climate_zone, :description,
                        :source_url, :source_title, :source_spider
                    )
                """),
                {
                    "id": str(image_id),
                    "storage_path": str(dest_path),
                    "sha256": sha256,
                    "width": width,
                    "height": height,
                    "caption": caption_data.get("title", ""),
                    "caption_method": caption_data.get("method", ""),
                    "license": "unknown",
                    "embedding_version": settings.embedding_version,
                    "metadata_json": json.dumps(full_meta, ensure_ascii=False, default=str),
                    "tags": tags,
                    "name": building_meta.get("name") or caption_data.get("title"),
                    "architect": building_meta.get("architect"),
                    "year_built": building_meta.get("year_built"),
                    "location_country": building_meta.get("location_country"),
                    "location_city": building_meta.get("location_city"),
                    "typology": building_meta.get("typology") or [],
                    "materials": building_meta.get("materials") or [],
                    "structural_system": building_meta.get("structural_system"),
                    "climate_zone": building_meta.get("climate_zone"),
                    "description": building_meta.get("description"),
                    "source_url": f"local://{image_path.name}",
                    "source_title": caption_data.get("title") or image_path.stem,
                    "source_spider": "local_ingest",
                },
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            log.error("ingest_db_write_failed", error=str(exc))
            return {"status": "error", "stage": "db", "file": image_path.name, "error": str(exc)}

    # ── 6. Write metadata JSON ───────────────────────────────────────
    _write_metadata_json(settings, str(image_id), image_path.name, full_meta)

    # ── 7. Move to production storage ───────────────────────────────
    try:
        shutil.move(str(image_path), str(dest_path))
        log.info("ingest_complete", image_id=str(image_id), dest=dest_filename)
    except Exception as exc:
        log.error("ingest_move_failed", error=str(exc))
        return {
            "status": "error",
            "stage": "move",
            "file": image_path.name,
            "image_id": str(image_id),
            "error": str(exc),
        }

    return {"status": "ok", "image_id": str(image_id), "file": image_path.name}
