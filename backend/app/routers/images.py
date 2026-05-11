"""Image endpoints: upload, retrieval, status, per-image RAG chat, and image search."""
from __future__ import annotations

import hashlib
import io
import json
import uuid
from pathlib import Path

import redis
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from rq import Queue
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.deps import get_db
from app.models.source import Image, ImageRead
from app.services.embedder import embed_image
from app.services.vector_store import get_clip_store
from app.workers.captioner import caption_image
from app.workers.ingest_worker import complete_image_metadata
from app.workers.metadata_extractor import extract_building_metadata

router = APIRouter(tags=["images"])


class UploadResponse(BaseModel):
    image_id: str
    metadata_job_id: str | None = None
    ingest_status: str
    caption: str | None = None
    metadata_ready: bool = False


class ImageChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500)
    history: list[dict] = Field(default_factory=list)


@router.post("/images/upload", response_model=UploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> UploadResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    image_id = uuid.uuid4()
    ext = Path(file.filename or "upload.jpg").suffix.lower() or ".jpg"
    storage_root = Path(settings.storage_root) / "images"
    storage_root.mkdir(parents=True, exist_ok=True)
    local_path = storage_root / f"{image_id}{ext}"
    local_path.write_bytes(content)
    sha256 = hashlib.sha256(content).hexdigest()

    existing = db.query(Image).filter(Image.sha256 == sha256).first()
    if existing:
        return UploadResponse(image_id=str(existing.id), ingest_status=existing.ingest_status)

    from PIL import Image as PILImage

    with PILImage.open(io.BytesIO(content)) as pil:
        rgb = pil.convert("RGB")
        width, height = rgb.size
        vec = embed_image(rgb)

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    import numpy as np

    clip_store.add(vec[np.newaxis, :], [str(image_id)])

    import asyncio
    import logging
    _log = logging.getLogger(__name__)

    # Caption inline — runs synchronously in executor so metadata is ready immediately
    loop = asyncio.get_running_loop()
    caption_data: dict = {}
    caption_text = ""
    caption_method = ""
    try:
        caption_data = await loop.run_in_executor(
            None, caption_image, str(local_path.resolve()), settings
        )
        caption_text = caption_data.get("caption", "")
        caption_method = caption_data.get("method", "")
    except Exception as exc:
        _log.warning("upload_caption_failed: %s", exc)

    # Use VLM metadata directly; building extraction is best-effort
    meta: dict = caption_data if caption_data else {"filename": file.filename}
    tags: list = list(dict.fromkeys(
        (caption_data.get("tags") or [])
        + (caption_data.get("architectural_style") or [])
        + (caption_data.get("materials") or [])
        + (caption_data.get("program_hints") or [])
    ))
    try:
        if caption_data:
            await loop.run_in_executor(
                None,
                extract_building_metadata,
                caption_text,
                caption_data,
                {},
                settings,
            )
    except Exception as exc:
        _log.warning("upload_metadata_failed: %s", exc)

    metadata_ready = bool(caption_text)
    ingest_status = "ready" if metadata_ready else "embedding_complete"

    # Persist metadata as JSON sidecar file
    try:
        metadata_dir = Path(settings.storage_root) / "metadata"
        metadata_dir.mkdir(parents=True, exist_ok=True)
        (metadata_dir / f"{image_id}.json").write_text(
            json.dumps(meta, ensure_ascii=False, default=str), encoding="utf-8"
        )
    except Exception as exc:
        _log.warning("metadata_json_write_failed: %s", exc)

    image = Image(
        id=image_id,
        storage_path=str(local_path.resolve()),
        sha256=sha256,
        width=width,
        height=height,
        caption=caption_text or None,
        caption_method=caption_method or None,
        license="unknown",
        embedding_version=settings.embedding_version,
        ingest_status=ingest_status,
        metadata_ready=metadata_ready,
        metadata_json=meta,
        tags=tags,
    )
    db.add(image)
    db.commit()

    # Enqueue retry job only if captioning failed (worker can retry later)
    job_id = None
    if not metadata_ready:
        try:
            q = Queue("ingest", connection=redis.from_url(settings.redis_url))
            job = q.enqueue(complete_image_metadata, str(image_id))
            job_id = job.id
        except Exception:
            pass

    return UploadResponse(
        image_id=str(image_id),
        metadata_job_id=job_id,
        ingest_status=image.ingest_status,
        caption=caption_text or None,
        metadata_ready=metadata_ready,
    )


@router.get("/images")
async def list_images(
    skip: int = 0,
    limit: int = 40,
    sort: str = "created_at_desc",
    db: Session = Depends(get_db),
) -> dict:
    """List all indexed images with pagination, shaped like search results."""
    from app.models.building import Building

    q = db.query(Image)
    if sort == "created_at_desc":
        q = q.order_by(Image.created_at.desc())
    elif sort == "created_at_asc":
        q = q.order_by(Image.created_at.asc())
    elif sort == "year_desc":
        q = (
            q.outerjoin(Building, Image.building_id == Building.id)
            .order_by(Building.year_built.desc().nullslast())
        )
    elif sort == "year_asc":
        q = (
            q.outerjoin(Building, Image.building_id == Building.id)
            .order_by(Building.year_built.asc().nullsfirst())
        )

    total = q.count()
    images = q.offset(skip).limit(limit).all()

    building_ids = [img.building_id for img in images if img.building_id]
    buildings: dict = {}
    if building_ids:
        rows = db.query(Building).filter(Building.id.in_(building_ids)).all()
        buildings = {str(b.id): b for b in rows}

    results = []
    for img in images:
        b = buildings.get(str(img.building_id)) if img.building_id else None
        meta = img.metadata_json or {}
        results.append({
            "building_id": str(img.building_id) if img.building_id else None,
            "image_id": str(img.id),
            "score": 1.0,
            "metadata": {
                "architect": b.architect if b else meta.get("architect"),
                "year_built": (b.year_built if b else None) or meta.get("year_built"),
                "location_country": b.location_country if b else meta.get("location_country"),
                "location_city": b.location_city if b else meta.get("location_city"),
                "typology": (b.typology if b else None) or meta.get("typology", []),
                "materials": (b.materials if b else None) or meta.get("materials", []),
                "structural_system": b.structural_system if b else meta.get("structural_system"),
                "climate_zone": b.climate_zone if b else meta.get("climate_zone"),
                "description": (b.description if b else None) or img.caption,
            },
            "source": {
                "url": None,
                "license": img.license,
                "photographer": img.photographer,
            },
            "image_url": f"/images/{img.id}/raw",
            "tags": img.tags or [],
        })

    return {"results": results, "total": total, "skip": skip, "limit": limit}


@router.get("/images/{image_id}/status")
async def get_image_status(image_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return {
        "image_id": str(image.id),
        "ingest_status": image.ingest_status,
        "metadata_ready": image.metadata_ready,
    }


@router.get("/images/{image_id}/raw")
async def get_image_raw(image_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    local = Path(image.storage_path)
    if not local.exists():
        raise HTTPException(status_code=404, detail="Image not found in storage")
    return Response(content=local.read_bytes(), media_type=_guess_media_type(local.suffix))


@router.get("/images/{image_id}", response_model=ImageRead)
async def get_image_metadata(image_id: uuid.UUID, db: Session = Depends(get_db)) -> Image:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return image


@router.post("/images/{image_id}/chat")
async def image_chat(
    image_id: uuid.UUID,
    request: ImageChatRequest,
    db: Session = Depends(get_db),
) -> dict:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    system = (
        "You are an architectural image RAG assistant. Ground your answer only in provided metadata/caption. "
        "If uncertain, explicitly say unknown."
    )
    user = (
        f"Image metadata JSON:\n{image.metadata_json}\n\n"
        f"Caption:\n{image.caption or ''}\n\n"
        f"Tags:\n{', '.join(image.tags or [])}\n\n"
        f"User question:\n{request.message}"
    )
    from app.services.llm import complete
    answer = complete(system=system, user=user, temperature=0.1, max_tokens=400)
    return {"answer": answer}


@router.post("/search/by-image")
async def search_by_image(
    file: UploadFile = File(...),
    score_threshold: float = 0.20,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Visual similarity search — embed uploaded image with CLIP, return similar images.

    Image is NOT stored in the corpus; this is purely for querying.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    import asyncio
    import time
    from PIL import Image as PILImage
    from app.services import embedder as emb_service
    from app.services.retrieval import _fetch_result_metadata, _building_to_dict

    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()

    with PILImage.open(io.BytesIO(content)) as pil:
        rgb = pil.convert("RGB")

    vec = await loop.run_in_executor(None, emb_service.embed_image, rgb)

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    ids, scores = clip_store.search(vec, settings.top_k_retrieve)

    pairs = [
        (iid, s) for iid, s in zip(ids, scores) if s >= score_threshold
    ]
    final_ids = [iid for iid, _ in pairs[: settings.top_k_final]]
    score_map = {iid: s for iid, s in pairs}

    meta_map = _fetch_result_metadata(final_ids, db)

    results = []
    for iid in final_ids:
        row = meta_map.get(iid, {})
        building = row.get("building")
        source = row.get("source")
        image_obj = row.get("image")
        results.append({
            "building_id": str(building.id) if building else None,
            "image_id": iid,
            "score": round(score_map.get(iid, 0.0), 4),
            "metadata": _building_to_dict(building),
            "source": {
                "url": source.url if source else None,
                "license": (image_obj.license if image_obj else (source.license if source else None)),
                "photographer": image_obj.photographer if image_obj else None,
                "license_url": image_obj.license_url if image_obj else None,
            },
            "image_url": f"/images/{iid}/raw",
            "image_metadata": image_obj.metadata_json if image_obj else {},
            "tags": image_obj.tags if image_obj else [],
        })

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {"results": results, "latency_ms": {"total": elapsed_ms}}


def _guess_media_type(suffix: str) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(suffix.lower(), "application/octet-stream")
