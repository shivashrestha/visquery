"""RQ ingest worker.

Receives image + metadata from the scraper pipeline and runs:
  1. Embedder  — CLIP (computed once, reused for style enrichment + FAISS)
  2. Artifacts — VLM extracts title + full artifact JSON directly from the image
  3. Index     — adds vectors to FAISS
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


def complete_image_metadata(image_id: str) -> dict[str, Any]:
    """Background job: CLIP embed (if needed) + VLM artifact extraction."""
    from app.config import get_settings
    from app.workers.captioner import extract_image_artifacts

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

        # CLIP embed + FAISS index
        vec = None
        if row.ingest_status == "processing":
            try:
                import numpy as np
                from app.services.embedder import embed_image_from_path
                from app.services.vector_store import get_clip_store
                vec = embed_image_from_path(resolved_path)
                clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
                clip_store.add(vec[np.newaxis, :], [image_id])
                log.info("clip_indexed")
            except Exception as exc:
                log.warning("clip_index_failed", error=str(exc))

        # VLM artifact extraction (single pass)
        log.info("artifact_extraction_start")
        artifacts: dict = {}
        try:
            artifacts = extract_image_artifacts(
                resolved_path, settings, image_vec=vec, enrich_style=True
            )
            log.info("artifact_extraction_done", style=artifacts.get("style", {}).get("primary"))
        except Exception as exc:
            log.warning("artifact_extraction_failed", error=str(exc))

        title = artifacts.pop("title", "") if artifacts else ""
        method = artifacts.pop("method", "") if artifacts else ""
        description = artifacts.get("description", "")
        building_type = artifacts.get("building_type", "")
        # architecture_style_classified kept inside artifacts for style filter compat
        style_classified = artifacts.get("architecture_style_classified", "") or (
            artifacts.get("style", {}).get("primary", "") if artifacts else ""
        )

        row.caption        = title
        row.caption_method = method
        row.tags           = [style_classified] if style_classified else []
        row.artifacts_json = artifacts if artifacts else None
        row.metadata_json  = {
            "title": title,
            "description": description,
            "building_type": building_type,
            "architecture_style_classified": style_classified,
        }
        row.metadata_ready = True
        row.ingest_status  = "ready"

        row.name      = title or row.name
        row.materials = artifacts.get("materials") or []

        _write_metadata_json(settings, image_id, {
            "filename": Path(row.storage_path).name,
            "title": title,
            "description": description,
            "building_type": building_type,
            "architecture_style_classified": style_classified,
            "artifacts": artifacts,
        })

        db.commit()
        log.info("pipeline_complete", image_id=image_id, title=title)

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
    from app.workers.captioner import extract_image_artifacts

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

        log.info("ingest_artifact_extraction")
        artifacts: dict = {}
        try:
            artifacts = extract_image_artifacts(storage_path, settings, image_vec=vec, enrich_style=True)
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
            caption_method=method,
            photographer=photographer,
            license=source_license,
            license_url=license_url,
            source_url=source_url,
            source_title=source_title,
            source_spider=spider_name,
            embedding_version=settings.embedding_version,
            metadata_json={
                "title": title,
                "description": description,
                "building_type": building_type,
                "architecture_style_classified": style_classified,
            },
            artifacts_json=artifacts if artifacts else None,
            tags=tags,
            name=title or None,
            materials=artifacts.get("materials") or [],
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
            "title": title,
            "description": description,
            "building_type": building_type,
            "architecture_style_classified": style_classified,
            "artifacts": artifacts,
        })

        db.commit()
        log.info("ingest_complete", image_id=str(image_id), title=title)
        return {"status": "ok", "image_id": str(image_id)}
