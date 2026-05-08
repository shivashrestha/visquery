"""Image endpoints — raw bytes and metadata."""
from __future__ import annotations

import uuid
from pathlib import Path

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.deps import get_db
from app.models.source import Image, ImageRead

logger = structlog.get_logger()

router = APIRouter(tags=["images"])


@router.get("/images/{image_id}/raw")
async def get_image_raw(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")

    storage_path: str = image.storage_path

    # If the path is a local absolute path, serve from disk.
    local = Path(storage_path)
    if local.is_absolute() and local.exists():
        content = local.read_bytes()
        media_type = _guess_media_type(local.suffix)
        return Response(content=content, media_type=media_type)

    # Otherwise proxy from object storage.
    url = f"{settings.object_storage_url.rstrip('/')}/{settings.object_storage_bucket}/{storage_path}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Image not found in storage")
        raise HTTPException(status_code=502, detail="Storage error")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Storage unreachable")

    return Response(
        content=resp.content,
        media_type=resp.headers.get("content-type", "image/jpeg"),
    )


@router.get("/images/{image_id}", response_model=ImageRead)
async def get_image_metadata(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Image:
    image = db.query(Image).filter(Image.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return image


def _guess_media_type(suffix: str) -> str:
    mapping = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    return mapping.get(suffix.lower(), "application/octet-stream")
