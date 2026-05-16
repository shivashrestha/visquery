"""Contact form endpoint — sends email via Resend."""
from __future__ import annotations

import html
import resend
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, field_validator

from app.config import get_settings

logger = structlog.get_logger()

router = APIRouter(tags=["contact"])

CONTACT_TO = "nearby.shiva@gmail.com"
CONTACT_FROM = "Visquery <info@visquery.com>"


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    message: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        if len(v) > 120:
            raise ValueError("Name too long.")
        return v

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message is required.")
        if len(v) > 4000:
            raise ValueError("Message too long (max 4 000 chars).")
        return v


@router.post("/contact")
async def send_contact(body: ContactRequest) -> dict:
    settings = get_settings()

    if not settings.resend_api:
        logger.warning("contact_form_no_api_key")
        raise HTTPException(status_code=503, detail="Contact service not configured.")

    resend.api_key = settings.resend_api

    safe_name = html.escape(body.name)
    safe_email = html.escape(str(body.email))
    safe_message = html.escape(body.message)
    html_body = (
        f"<p><strong>Name:</strong> {safe_name}</p>"
        f"<p><strong>Email:</strong> {safe_email}</p>"
        f"<p><strong>Message:</strong></p>"
        f"<p style='white-space:pre-wrap'>{safe_message}</p>"
    )

    try:
        resend.Emails.send({
            "from": CONTACT_FROM,
            "to": [CONTACT_TO],
            "reply_to": body.email,
            "subject": f"Contact: {safe_name}",
            "html": html_body,
        })
    except Exception as exc:
        logger.error("contact_form_send_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Failed to send message. Please try again.")

    logger.info("contact_form_sent", name=body.name, email=body.email)
    return {"ok": True}
