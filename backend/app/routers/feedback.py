"""Feedback endpoint — record per-result ratings."""
from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models.feedback import Feedback, FeedbackCreate, FeedbackRead
from app.models.source import Image

logger = structlog.get_logger()

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackRead, status_code=201)
def record_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
) -> Feedback:
    # Verify the referenced image exists to prevent orphaned feedback rows.
    image = db.query(Image).filter(Image.id == payload.result_image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail="Referenced image not found")

    record = Feedback(
        id=uuid.uuid4(),
        query_text=payload.query_text,
        result_image_id=payload.result_image_id,
        rating=payload.rating,
        reason=payload.reason,
        session_id=payload.session_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(
        "feedback_recorded",
        feedback_id=str(record.id),
        rating=payload.rating,
        session_id=payload.session_id,
    )
    return record
