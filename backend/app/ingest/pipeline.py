"""Per-image ingestion pipeline — VLM artifact extraction only.

Flow per image:
  1. SHA256 dedup  — skip if already in DB
  2. VLM artifacts — single pass extracts title + full artifact JSON via Ollama
  3. Write Image record to Postgres (ingest_status='processing')
  4. Write metadata JSON to disk
  5. Move image from raw_data/ to storage/images/

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

    from app.workers.captioner import extract_image_artifacts

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

    # ── 2. VLM artifact extraction (single pass) ─────────────────────
    log.info("ingest_artifact_extraction")
    artifacts: dict = {}
    try:
        artifacts = extract_image_artifacts(str(image_path), settings, enrich_style=False)
        log.info("ingest_artifacts_extracted", style=artifacts.get("style", {}).get("primary", "")[:40])
    except Exception as exc:
        log.warning("ingest_artifact_extraction_failed", error=str(exc))

    title = artifacts.pop("title", "") if artifacts else ""
    method = artifacts.pop("method", "") if artifacts else ""
    description = artifacts.get("description", "")
    building_type = artifacts.get("building_type", "")
    style_classified = artifacts.get("architecture_style_classified", "") or (
        artifacts.get("style", {}).get("primary", "") if artifacts else ""
    )
    tags = [style_classified] if style_classified else []
    full_meta = {
        "title": title,
        "description": description,
        "building_type": building_type,
        "architecture_style_classified": style_classified,
        "artifacts": artifacts,
    }

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
                        embedding_version, metadata_json, artifacts_json, tags,
                        ingest_status, metadata_ready,
                        name, materials,
                        source_url, source_title, source_spider
                    ) VALUES (
                        :id, :storage_path, :sha256, :width, :height,
                        :caption, :caption_method, :license,
                        :embedding_version, CAST(:metadata_json AS jsonb),
                        CAST(:artifacts_json AS jsonb), :tags,
                        'processing', true,
                        :name, :materials,
                        :source_url, :source_title, :source_spider
                    )
                """),
                {
                    "id": str(image_id),
                    "storage_path": str(dest_path),
                    "sha256": sha256,
                    "width": width,
                    "height": height,
                    "caption": title,
                    "caption_method": method,
                    "license": "unknown",
                    "embedding_version": settings.embedding_version,
                    "metadata_json": json.dumps(full_meta, ensure_ascii=False, default=str),
                    "artifacts_json": json.dumps(artifacts, ensure_ascii=False, default=str) if artifacts else None,
                    "tags": tags,
                    "name": title or image_path.stem,
                    "materials": artifacts.get("materials") or [],
                    "source_url": f"local://{image_path.name}",
                    "source_title": title or image_path.stem,
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
