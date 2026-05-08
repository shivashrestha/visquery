"""Admin and job-status endpoints."""
from __future__ import annotations

import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.deps import get_db
from app.models.building import Building
from app.models.source import Image
from app.models.feedback import Feedback

logger = structlog.get_logger()

router = APIRouter(tags=["admin"])


class CorpusStats(BaseModel):
    building_count: int
    image_count: int
    feedback_count: int
    embedding_version: str
    last_ingest_at: Optional[str] = None


@router.get("/admin/stats", response_model=CorpusStats)
def get_stats(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CorpusStats:
    building_count = db.query(func.count(Building.id)).scalar() or 0
    image_count = db.query(func.count(Image.id)).scalar() or 0
    feedback_count = db.query(func.count(Feedback.id)).scalar() or 0

    # Latest ingestion time from images table
    latest = db.query(func.max(Image.created_at)).scalar()
    last_ingest_at = latest.isoformat() if latest else None

    return CorpusStats(
        building_count=building_count,
        image_count=image_count,
        feedback_count=feedback_count,
        embedding_version=settings.embedding_version,
        last_ingest_at=last_ingest_at,
    )


@router.get("/jobs/{job_id}")
def get_job_status(job_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Return RQ job status."""
    import redis
    from rq.job import Job
    from rq.exceptions import NoSuchJobError

    try:
        r = redis.from_url(settings.redis_url)
        job = Job.fetch(job_id, connection=r)
    except NoSuchJobError:
        raise HTTPException(status_code=404, detail="Job not found")

    result: dict[str, Any] = {
        "job_id": job_id,
        "status": job.get_status().value,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "enqueued_at": job.enqueued_at.isoformat() if job.enqueued_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "ended_at": job.ended_at.isoformat() if job.ended_at else None,
    }

    if job.is_failed:
        result["error"] = str(job.exc_info)

    return result
