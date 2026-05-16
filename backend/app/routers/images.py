"""Image endpoints: upload, retrieval, status, per-image RAG chat, and image search."""
from __future__ import annotations

import hashlib
import io
import json
import uuid
from pathlib import Path

import redis
import structlog
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

logger = structlog.get_logger()

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


class EphemeralChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500)
    artifacts: dict = Field(default_factory=dict)


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
            "artifacts_json": img.artifacts_json or None,
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

    artifacts = image.artifacts_json or {}
    fields: list[str] = []

    # Build RAG context from artifacts
    style = artifacts.get("style", {})
    if style.get("primary"):
        label = style["primary"].replace("_", " ")
        sec = style.get("secondary") or []
        fields.append(f"Style: {label}" + (f" (also: {', '.join(s.replace('_', ' ') for s in sec)})" if sec else ""))

    elements = artifacts.get("architectural_elements", {})
    for group, vals in elements.items():
        if vals:
            fields.append(f"{group.replace('_', ' ').title()} elements: {', '.join(v.replace('_', ' ') for v in vals)}")

    if artifacts.get("materials"):
        fields.append(f"Materials: {', '.join(m.replace('_', ' ') for m in artifacts['materials'])}")

    if artifacts.get("spatial_features"):
        fields.append(f"Spatial features: {', '.join(f.replace('_', ' ') for f in artifacts['spatial_features'])}")

    if artifacts.get("relationships"):
        rels = "; ".join(
            f"{r['source'].replace('_', ' ')} {r['relation'].replace('_', ' ')} {r['target'].replace('_', ' ')}"
            for r in artifacts["relationships"]
        )
        fields.append(f"Structural relationships: {rels}")

    # Supplement with any known identity fields
    for label, val in [
        ("Name", image.name or image.caption),
        ("Location", ", ".join(filter(None, [image.location_city, image.location_country]))),
        ("Year built", image.year_built),
        ("Architect", image.architect),
    ]:
        if val:
            fields.append(f"{label}: {val}")

    known = "\n".join(fields) if fields else "No artifacts recorded for this image."

    system = (
        "You are a knowledgeable architectural assistant with access to extracted artifact data. "
        "Answer questions about the building directly and naturally, drawing on the artifact context provided.\n"
        "\n"
        "Tone and format:\n"
        "- Plain conversational prose. 2-3 sentences. No lists, no headers, no bold.\n"
        "- Speak as an expert: 'The structure relies on...' or 'The facade exhibits...' — "
        "never say 'based on the data', 'according to the artifacts', or reveal you are reading a source.\n"
        "- Infer from artifacts when a direct answer is missing (materials imply structure, style implies era, etc.). "
        "If nothing can be inferred, reply only: 'No info found for that.'\n"
        "\n"
        "Example:\n"
        "Q: What structural system is used?\n"
        "A (structural elements known): The ribbed vaults and flying buttresses distribute thrust outward, "
        "enabling the thin walls and tall clerestory windows characteristic of Gothic construction.\n"
        "A (no structural data): No info found for that."
    )
    user = f"Architectural artifacts:\n{known}\n\nQuestion: {request.message}"

    from app.services.llm import complete
    answer = complete(system=system, user=user, temperature=0.3, max_tokens=200)
    return {"answer": answer}


@router.post("/search/by-image")
async def search_by_image(
    file: UploadFile = File(...),
    score_threshold: float = 0.70,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Visual similarity search — optimize + CLIP embed + FAISS, returns similar images (≥85% cosine)."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    import asyncio
    import io as _io
    import tempfile
    import time
    from app.services import embedder as emb_service
    from app.services.image_optimizer import optimize_for_embedding
    from app.services.retrieval import _fetch_result_metadata, _image_to_metadata

    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()

    # 1. Optimize in-memory + CLIP embed
    rgb = await loop.run_in_executor(None, optimize_for_embedding, content)
    vec = await loop.run_in_executor(None, emb_service.embed_image, rgb)

    # 2. CLIP similarity search
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
            "artifacts_json": img.artifacts_json or None,
            "tags": img.tags or [],
        })

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {"results": results, "latency_ms": {"total": elapsed_ms}}


@router.get("/images/{image_id}/artifacts")
async def get_image_artifacts(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Return stored artifacts or generate them on-demand."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.artifacts_json:
        title = image.caption or (image.metadata_json or {}).get("title", "")
        artifacts_with_title = {"title": title, **image.artifacts_json}
        return {"image_id": str(image_id), "artifacts": artifacts_with_title, "generated": False}

    # Generate on-demand using existing metadata context
    try:
        from app.workers.artifact_extractor import extract_artifacts_from_context
        caption_data = image.metadata_json or {}
        building_meta = {
            "typology": image.typology or [],
            "materials": image.materials or [],
            "structural_system": image.structural_system,
            "description": image.description,
        }
        artifacts = extract_artifacts_from_context(caption_data, building_meta, settings)
        if artifacts:
            image.artifacts_json = artifacts
            db.commit()
        return {"image_id": str(image_id), "artifacts": artifacts, "generated": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Artifact extraction failed: {exc}")


@router.post("/images/analyze-ephemeral")
async def analyze_ephemeral_image(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> dict:
    """VLM artifact extraction for uploaded images — no storage, no DB write."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    import asyncio
    import time
    from app.services import embedder as emb_service
    from app.services.image_optimizer import optimize_for_embedding
    from app.workers.captioner import extract_image_artifacts_from_bytes

    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()

    rgb = await loop.run_in_executor(None, optimize_for_embedding, content)
    vec = await loop.run_in_executor(None, emb_service.embed_image, rgb)

    _content = content
    _settings = settings
    _vec = vec
    analysis = await loop.run_in_executor(
        None,
        lambda: extract_image_artifacts_from_bytes(_content, _settings, _vec, enrich_style=True),
    )

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return {"analysis": analysis, "latency_ms": elapsed_ms}


@router.post("/images/chat-ephemeral")
async def chat_ephemeral_image(request: EphemeralChatRequest) -> dict:
    """Stateless architectural chat — uses provided artifacts, no DB lookup."""
    artifacts = request.artifacts
    fields: list[str] = []

    style = artifacts.get("style", {})
    if isinstance(style, dict) and style.get("primary"):
        label = style["primary"].replace("_", " ")
        sec = style.get("secondary") or []
        fields.append(
            f"Style: {label}"
            + (f" (also: {', '.join(s.replace('_', ' ') for s in sec if isinstance(s, str))})" if sec else "")
        )

    elements = artifacts.get("architectural_elements", {})
    if isinstance(elements, dict):
        for group, vals in elements.items():
            if vals and isinstance(vals, list):
                fields.append(
                    f"{group.replace('_', ' ').title()} elements: "
                    f"{', '.join(v.replace('_', ' ') for v in vals if isinstance(v, str))}"
                )

    mats = artifacts.get("materials")
    if mats and isinstance(mats, list):
        fields.append(f"Materials: {', '.join(m.replace('_', ' ') for m in mats if isinstance(m, str))}")

    sf = artifacts.get("spatial_features")
    if sf:
        flat: list[str] = []
        if isinstance(sf, dict):
            for vals in sf.values():
                if isinstance(vals, list):
                    flat.extend(v for v in vals if isinstance(v, str))
        elif isinstance(sf, list):
            flat = [v for v in sf if isinstance(v, str)]
        if flat:
            fields.append(f"Spatial features: {', '.join(f.replace('_', ' ') for f in flat)}")

    rels = artifacts.get("relationships")
    if rels and isinstance(rels, list):
        rel_strs = [
            f"{r['source'].replace('_', ' ')} {r['relation'].replace('_', ' ')} {r['target'].replace('_', ' ')}"
            for r in rels
            if isinstance(r, dict) and all(k in r for k in ("source", "relation", "target"))
        ]
        if rel_strs:
            fields.append(f"Structural relationships: {'; '.join(rel_strs)}")

    title = artifacts.get("title", "")
    if title:
        fields.append(f"Name: {title}")
    description = artifacts.get("description", "")
    if description:
        fields.append(f"Description: {description}")

    known = "\n".join(fields) if fields else "No artifacts recorded for this image."

    system = (
        "You are a knowledgeable architectural assistant with access to extracted artifact data. "
        "Answer questions about the building directly and naturally, drawing on the artifact context provided.\n"
        "\n"
        "Tone and format:\n"
        "- Plain conversational prose. 2-3 sentences. No lists, no headers, no bold.\n"
        "- Speak as an expert: 'The structure relies on...' or 'The facade exhibits...' — "
        "never say 'based on the data', 'according to the artifacts', or reveal you are reading a source.\n"
        "- Infer from artifacts when a direct answer is missing (materials imply structure, style implies era, etc.). "
        "If nothing can be inferred, reply only: 'No info found for that.'\n"
    )
    user = f"Architectural artifacts:\n{known}\n\nQuestion: {request.message}"

    from app.services.llm import complete
    answer = complete(system=system, user=user, temperature=0.3, max_tokens=200)
    return {"answer": answer}


def _guess_media_type(suffix: str) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(suffix.lower(), "application/octet-stream")
