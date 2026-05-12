"""Image endpoints: upload, retrieval, status, per-image RAG chat, and image search."""
from __future__ import annotations

import hashlib
import io
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
from app.workers.ingest_worker import complete_image_metadata

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

    import numpy as np

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    clip_store.add(vec[np.newaxis, :], [str(image_id)])

    image = Image(
        id=image_id,
        storage_path=str(local_path.resolve()),
        sha256=sha256,
        width=width,
        height=height,
        license="unknown",
        embedding_version=settings.embedding_version,
        ingest_status="processing",
        metadata_ready=False,
        metadata_json={"filename": file.filename},
        tags=[],
    )
    db.add(image)
    db.commit()

    job_id = None
    try:
        q = Queue("ingest", connection=redis.from_url(settings.redis_url))
        job = q.enqueue(complete_image_metadata, str(image_id), job_timeout=600)
        job_id = job.id
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("enqueue_failed: %s", exc)

    return UploadResponse(
        image_id=str(image_id),
        metadata_job_id=job_id,
        ingest_status="processing",
        caption=None,
        metadata_ready=False,
    )


@router.get("/images")
async def list_images(
    skip: int = 0,
    limit: int = 40,
    sort: str = "created_at_desc",
    db: Session = Depends(get_db),
) -> dict:
    """List all indexed images with pagination, shaped like search results."""
    q = db.query(Image)
    if sort == "created_at_desc":
        q = q.order_by(Image.created_at.desc())
    elif sort == "created_at_asc":
        q = q.order_by(Image.created_at.asc())
    elif sort == "year_desc":
        q = q.order_by(Image.year_built.desc().nullslast())
    elif sort == "year_asc":
        q = q.order_by(Image.year_built.asc().nullsfirst())

    total = q.count()
    images = q.offset(skip).limit(limit).all()

    results = []
    for img in images:
        results.append({
            "building_id": None,
            "image_id": str(img.id),
            "score": 1.0,
            "metadata": {
                "name": img.name,
                "architect": img.architect,
                "year_built": img.year_built,
                "location_country": img.location_country,
                "location_city": img.location_city,
                "typology": img.typology or [],
                "materials": img.materials or [],
                "structural_system": img.structural_system,
                "climate_zone": img.climate_zone,
                "description": img.description or img.caption,
            },
            "source": {
                "url": img.source_url,
                "title": img.source_title,
                "license": img.license,
                "photographer": img.photographer,
            },
            "image_url": f"/images/{img.id}/raw",
            "image_metadata": img.metadata_json or {},
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
async def get_image_raw(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    from app.workers.ingest_worker import _resolve_storage_path
    resolved = _resolve_storage_path(image.storage_path, settings)
    local = Path(resolved)
    if not local.exists():
        raise HTTPException(status_code=404, detail="Image not found in storage")
    if resolved != image.storage_path:
        image.storage_path = resolved
        db.commit()
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

    meta = image.metadata_json or {}
    fields: list[str] = []
    for label, val in [
        ("Name", meta.get("name") or image.name),
        ("Architect", meta.get("architect") or image.architect),
        ("Year", meta.get("year_built") or image.year_built),
        ("Location", ", ".join(filter(None, [image.location_city, image.location_country]))),
        ("Typology", ", ".join(image.typology or [])),
        ("Materials", ", ".join(image.materials or [])),
        ("Structure", image.structural_system),
        ("Climate", image.climate_zone),
        ("Style", meta.get("architecture_style_classified")),
        ("Description", image.description or image.caption),
        ("Tags", ", ".join(image.tags or [])),
    ]:
        if val:
            fields.append(f"{label}: {val}")

    known = "\n".join(fields) if fields else "No details recorded."

    system = (
        "You are a knowledgeable architectural assistant. Answer questions about a building naturally and directly, "
        "as a person who knows architecture well — not as a system reading from a file.\n"
        "\n"
        "Tone and format:\n"
        "- Plain conversational prose. 2-3 sentences. No lists, no headers, no bold.\n"
        "- Speak directly: 'The building uses...' or 'It sits in...' — never 'based on', 'according to', 'the metadata shows', 'as described', 'derived from', or any phrase that reveals you are reading a data source.\n"
        "- When a detail is missing, infer from what you know (materials suggest structure, location suggests climate, typology suggests program). "
        "If there is genuinely nothing to work with, say only: 'No info found for that.'\n"
        "\n"
        "Examples of good answers:\n"
        "Q: What's the structural strategy?\n"
        "A (no structural info, but materials known): The exposed concrete and long-span proportions suggest a frame or flat-slab system, though the exact structural scheme isn't documented here.\n"
        "A (nothing to infer): No info found for that.\n"
        "\n"
        "Q: What style is this?\n"
        "A: It reads as late modernism — minimal detailing, flush surfaces, and a restrained material palette with no ornamental gestures.\n"
        "\n"
        "Q: How does it respond to climate?\n"
        "A (no climate data, location known): Situated in Japan, the building likely contends with humid summers and mild winters — the deep overhangs and natural ventilation evident in the section support that reading.\n"
        "A (nothing to infer): No info found for that."
    )
    user = f"Building facts:\n{known}\n\nQuestion: {request.message}"

    from app.services.llm import complete
    answer = complete(system=system, user=user, temperature=0.3, max_tokens=200)
    return {"answer": answer}


@router.post("/search/by-image")
async def search_by_image(
    file: UploadFile = File(...),
    score_threshold: float = 0.10,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Visual similarity search — embed uploaded image with CLIP, return similar images."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    import asyncio
    import time
    from PIL import Image as PILImage
    from app.services import embedder as emb_service
    from app.services.retrieval import _fetch_result_metadata, _image_to_metadata

    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()

    with PILImage.open(io.BytesIO(content)) as pil:
        rgb = pil.convert("RGB")

    vec = await loop.run_in_executor(None, emb_service.embed_image, rgb)

    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    ids, scores = clip_store.search(vec, settings.top_k_retrieve)

    pairs = [(iid, s) for iid, s in zip(ids, scores) if s >= score_threshold]
    final_ids = [iid for iid, _ in pairs[: settings.top_k_final]]
    score_map = {iid: s for iid, s in pairs}

    meta_map = _fetch_result_metadata(final_ids, db)

    results = []
    for iid in final_ids:
        img = meta_map.get(iid)
        if img is None:
            continue
        results.append({
            "building_id": None,
            "image_id": iid,
            "score": round(score_map.get(iid, 0.0), 4),
            "metadata": _image_to_metadata(img),
            "source": {
                "url": img.source_url,
                "license": img.license,
                "photographer": img.photographer,
                "license_url": img.license_url,
            },
            "image_url": f"/images/{iid}/raw",
            "image_metadata": img.metadata_json or {},
            "tags": img.tags or [],
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
