"""Precedent report generation: multi-image comparative study + PDF export.

POST /reports/precedent — synthesize a structured precedent study from the
artifacts of 2+ images (stored artifacts_json and/or ephemeral analyses)
via a single LLM call. Results are cached in the `reports` table keyed by
the input payload, so regeneration is a DB lookup.

GET /reports/{report_id}      — cached report JSON
GET /reports/{report_id}/pdf  — server-rendered PDF with image thumbnails
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.deps import get_db
from app.models.report import Report
from app.models.source import Image

logger = structlog.get_logger()

router = APIRouter(tags=["reports"])

SECTION_HEADINGS = [
    "Overview",
    "Typology & Program",
    "Materials & Construction",
    "Structural Logic",
    "Climate & Context Response",
    "Comparative Observations",
    "References",
]

_FOCUS_HINTS = {
    "materials": "Give extra depth to material palettes, construction expression, and detailing.",
    "structure": "Give extra depth to structural systems, load paths, and spans.",
    "typology": "Give extra depth to program, typology lineage, and spatial organization.",
    "climate": "Give extra depth to climatic response, orientation, envelope, and context.",
}

_SYSTEM_PROMPT_MULTI = """
You are an architectural historian writing a comparative precedent study.

You receive artifact data for several buildings, each tagged [IMG-1], [IMG-2], ...
Synthesize a rigorous comparative study across ALL of them.

Rules:
- Every factual claim MUST cite its source image inline as [IMG-1], [IMG-2], etc.
- Compare and contrast across images — do not write isolated per-image summaries.
- Ground every statement in the provided artifact data; never invent buildings,
  architects, dates, or features not present in the data.
- body_md is GitHub-flavored markdown prose (bold/italic allowed, no headings inside).
- The References section lists each image as one line: "[IMG-n] — title, key identifying facts".
- Return ONLY valid JSON, no markdown fences, matching exactly:

{
  "sections": [
    {"heading": "<section heading>", "body_md": "<markdown prose with [IMG-n] citations>", "image_refs": [1, 2]}
  ]
}

Produce exactly these sections in order:
Overview, Typology & Program, Materials & Construction, Structural Logic,
Climate & Context Response, Comparative Observations, References.
image_refs lists the image numbers cited in that section.
"""

_SYSTEM_PROMPT_SINGLE = """
You are an architectural historian writing an individual architectural precedent report.

You receive artifact data for one building tagged [IMG-1].
Analyze ONLY this image and its provided metadata.

Rules:
- Every factual claim MUST cite the source image inline as [IMG-1].
- Ground every statement in the provided artifact data; never invent buildings,
  architects, dates, or features not present in the data.
- body_md is GitHub-flavored markdown prose (bold/italic allowed, no headings inside).
- The References section lists the image as one line: "[IMG-1] - title, key identifying facts".
- Return ONLY valid JSON, no markdown fences, matching exactly:

{
  "sections": [
    {"heading": "<section heading>", "body_md": "<markdown prose with [IMG-1] citations>", "image_refs": [1]}
  ]
}

Produce exactly these sections in order:
Overview, Typology & Program, Materials & Construction, Structural Logic,
Climate & Context Response, Design Analysis, References.
image_refs lists the image numbers cited in that section.
"""

_SYSTEM_PROMPT_SINGLE_DEEP = """
You are an architectural historian writing a comprehensive individual precedent report.

You receive complete metadata and artifact data for ONE building, tagged [IMG-1].
Write a rigorous, deeply analytical precedent report suitable for architectural research.

Rules:
- Every factual claim MUST cite [IMG-1] inline.
- Ground every statement in the provided data; never invent architects, dates, or features.
- body_md is GitHub-flavored markdown prose (bold/italic allowed, no headings inside sections).
- References section: one line "[IMG-1] — full title, architect, year, location, key facts".
- Return ONLY valid JSON, no markdown fences:

{
  "sections": [
    {"heading": "<heading>", "body_md": "<markdown prose with [IMG-1] citations>", "image_refs": [1]}
  ]
}

Produce exactly these sections in order:
Overview, Typology & Program, Materials & Construction, Structural Logic,
Climate & Context Response, Design Analysis, Precedent Value, References.
image_refs for every section must be [1].
"""


class PrecedentReportRequest(BaseModel):
    image_ids: list[str] = Field(default_factory=list)
    ephemeral_items: list[dict] = Field(default_factory=list, max_length=8)
    focus: Optional[Literal["materials", "structure", "typology", "climate"]] = None


class SinglePrecedentRequest(BaseModel):
    image_id: str
    metadata_context: dict = Field(default_factory=dict)
    focus: Optional[Literal["materials", "structure", "typology", "climate"]] = None


def _flatten(vals: Any) -> list[str]:
    """Collect strings from a list or dict-of-lists artifact field."""
    out: list[str] = []
    if isinstance(vals, list):
        out = [v for v in vals if isinstance(v, str)]
    elif isinstance(vals, dict):
        for v in vals.values():
            if isinstance(v, list):
                out.extend(x for x in v if isinstance(x, str))
    return out


def _artifact_summary(artifacts: dict, identity: dict | None = None) -> str:
    """Compact one-image context block for the LLM prompt."""
    lines: list[str] = []
    identity = identity or {}

    for label, key in [("Name", "name"), ("Architect", "architect"), ("Year", "year_built"), ("Location", "location")]:
        if identity.get(key):
            lines.append(f"{label}: {identity[key]}")

    if artifacts.get("title"):
        lines.append(f"Title: {artifacts['title']}")
    if artifacts.get("description"):
        lines.append(f"Description: {artifacts['description']}")
    if artifacts.get("building_type"):
        lines.append(f"Building type: {artifacts['building_type']}")

    style = artifacts.get("style") or {}
    if isinstance(style, dict) and style.get("primary"):
        lines.append(f"Style: {style['primary']}")
        if style.get("style_evidence"):
            lines.append(f"Style evidence: {', '.join(_flatten(style['style_evidence']))}")
    style_candidates = _flatten(artifacts.get("style_classification_candidates"))
    if style_candidates:
        lines.append(f"Style classification candidates: {', '.join(style_candidates)}")

    elements = artifacts.get("architectural_elements") or {}
    if isinstance(elements, dict):
        for group, vals in elements.items():
            flat = _flatten(vals)
            if flat:
                lines.append(f"{group.replace('_', ' ').title()} elements: {', '.join(flat)}")

    mats = _flatten(artifacts.get("materials"))
    if mats:
        lines.append(f"Materials: {', '.join(mats)}")
    md = artifacts.get("material_details") or {}
    if isinstance(md, dict):
        ce = _flatten(md.get("construction_expression"))
        if ce:
            lines.append(f"Construction expression: {', '.join(ce)}")

    spatial = _flatten(artifacts.get("spatial_features"))
    if spatial:
        lines.append(f"Spatial features: {', '.join(spatial)}")

    env = artifacts.get("environment") or {}
    if isinstance(env, dict):
        for key in ("setting", "urban_context", "climate_indicators"):
            flat = _flatten(env.get(key))
            if flat:
                lines.append(f"{key.replace('_', ' ').title()}: {', '.join(flat)}")

    rels = artifacts.get("relationships")
    if isinstance(rels, list):
        rel_strs = [
            f"{r['source']} {r['relation']} {r['target']}"
            for r in rels
            if isinstance(r, dict) and all(k in r for k in ("source", "relation", "target"))
        ]
        if rel_strs:
            lines.append(f"Structural relationships: {'; '.join(rel_strs)}")

    tags = _flatten(artifacts.get("retrieval_tags")) or _flatten(artifacts.get("semantic_keywords"))
    if tags:
        lines.append(f"Tags: {', '.join(tags)}")
    if artifacts.get("search_index_text"):
        lines.append(f"Search index text: {artifacts['search_index_text']}")

    return "\n".join(lines) if lines else "No artifact data available."


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _image_report_artifacts(img: Image) -> dict:
    """Merge extracted artifacts with the metadata shown on the image detail page."""
    meta = img.metadata_json or {}
    artifacts = dict(img.artifacts_json or {})

    description = _first_string(
        artifacts.get("description"),
        img.description,
        meta.get("description"),
        img.caption,
    )
    if description:
        artifacts.setdefault("description", description)

    title = _first_string(
        artifacts.get("title"),
        img.name,
        img.source_title,
        meta.get("title"),
    )
    if title:
        artifacts.setdefault("title", title)

    building_type = _first_string(
        artifacts.get("building_type"),
        (img.typology or [None])[0],
        meta.get("building_type"),
    )
    if building_type:
        artifacts.setdefault("building_type", building_type)

    materials = _flatten(artifacts.get("materials")) or _flatten(img.materials) or _flatten(meta.get("materials"))
    if materials:
        artifacts["materials"] = materials

    elements = artifacts.get("architectural_elements")
    if not isinstance(elements, dict):
        elements = {}
    if img.structural_system and not elements.get("structural"):
        elements["structural"] = [img.structural_system]
    if elements:
        artifacts["architectural_elements"] = elements

    if img.climate_zone:
        env = artifacts.get("environment")
        if not isinstance(env, dict):
            env = {}
        env.setdefault("climate_indicators", [img.climate_zone])
        artifacts["environment"] = env

    style_primary = None
    style = artifacts.get("style")
    if isinstance(style, dict):
        style_primary = _first_string(style.get("primary"))
    style_primary = style_primary or _first_string(meta.get("architecture_style_classified"))
    if style_primary:
        style_dict = dict(style) if isinstance(style, dict) else {}
        style_dict.setdefault("primary", style_primary)
        artifacts["style"] = style_dict

    style_top = meta.get("architecture_style_top")
    if isinstance(style_top, list) and style_top:
        labels = [
            f"{entry[0]} ({float(entry[1]) * 100:.1f}%)"
            for entry in style_top
            if isinstance(entry, list) and len(entry) >= 2 and isinstance(entry[0], str)
            and isinstance(entry[1], (int, float))
        ]
        if labels:
            artifacts["style_classification_candidates"] = labels

    raw_text = _first_string(meta.get("raw_text"))
    if raw_text:
        artifacts["search_index_text"] = raw_text[:1200]

    if img.tags:
        artifacts["retrieval_tags"] = list(img.tags)

    return artifacts


def _image_identity(img: Image) -> dict:
    location = ", ".join(filter(None, [img.location_city, img.location_country]))
    return {
        "name": img.name or img.caption or (img.metadata_json or {}).get("title"),
        "architect": img.architect,
        "year_built": img.year_built,
        "location": location or None,
    }


def _image_display_title(img: Image) -> str:
    return (
        img.name
        or img.source_title
        or img.caption
        or (img.metadata_json or {}).get("title")
        or "Untitled building"
    )


_TRAILING_COMMA = re.compile(r",\s*([}\]])")


def _loads_lenient(text: str) -> dict:
    """json.loads with repair passes for common LLM defects."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Trailing commas before } or ]
    repaired = _TRAILING_COMMA.sub(r"\1", text)
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass
    # Raw newlines inside string literals (LLM writes multi-line body_md unescaped)
    out: list[str] = []
    in_str = False
    escaped = False
    for ch in repaired:
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            elif ch == "\n":
                out.append("\\n")
                continue
            elif ch == "\t":
                out.append("\\t")
                continue
        elif ch == '"':
            in_str = True
        out.append(ch)
    return json.loads("".join(out))


def _parse_report_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    data = _loads_lenient(match.group() if match else raw)
    sections = data.get("sections")
    if not isinstance(sections, list) or not sections:
        raise ValueError("LLM response missing sections")
    clean: list[dict] = []
    for sec in sections:
        if not isinstance(sec, dict) or not sec.get("heading") or not sec.get("body_md"):
            continue
        refs = sec.get("image_refs") or []
        clean.append({
            "heading": str(sec["heading"]),
            "body_md": str(sec["body_md"]),
            "image_refs": [int(r) for r in refs if isinstance(r, (int, float, str)) and str(r).isdigit()],
        })
    if not clean:
        raise ValueError("LLM response contained no usable sections")
    return {"sections": clean}


@router.post("/reports/precedent")
async def generate_precedent_report(
    req: PrecedentReportRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    if len(req.image_ids) + len(req.ephemeral_items) < 1:
        raise HTTPException(status_code=400, detail="At least 1 item is required for a precedent study")
    if len(req.image_ids) > 12:
        raise HTTPException(status_code=400, detail="At most 12 stored images per report")

    # Resolve stored images, preserving request order (order defines IMG-n refs)
    images: list[Image] = []
    for iid in req.image_ids:
        try:
            img = db.query(Image).filter(Image.id == uuid.UUID(iid)).first()
        except ValueError:
            img = None
        if img is None:
            raise HTTPException(status_code=404, detail=f"Image not found: {iid}")
        images.append(img)

    cache_key = hashlib.sha256(
        json.dumps(
            {
                "image_ids": req.image_ids,
                "ephemeral": req.ephemeral_items,
                "focus": req.focus,
                "v": 3,
            },
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()

    cached = db.query(Report).filter(Report.cache_key == cache_key).first()
    if cached is not None:
        return {"report_id": str(cached.id), "cached": True, **cached.report_json}

    # Build per-image context blocks; refs: stored images first, then ephemeral
    blocks: list[str] = []
    manifest: list[dict] = []
    ref = 0
    for img in images:
        ref += 1
        artifacts = _image_report_artifacts(img)
        blocks.append(f"[IMG-{ref}]\n{_artifact_summary(artifacts, _image_identity(img))}")
        manifest.append({
            "ref": ref,
            "image_id": str(img.id),
            "title": _image_display_title(img),
            "image_url": f"/images/{img.id}/raw",
        })
    for item in req.ephemeral_items:
        ref += 1
        artifacts = item.get("analysis") if isinstance(item.get("analysis"), dict) else item
        blocks.append(f"[IMG-{ref}]\n{_artifact_summary(artifacts)}")
        manifest.append({
            "ref": ref,
            "image_id": None,
            "title": item.get("title") or artifacts.get("title") or "Uploaded image",
            "image_url": item.get("image_data_url"),
        })

    focus_line = f"\nFocus: {_FOCUS_HINTS[req.focus]}" if req.focus else ""
    system_prompt = _SYSTEM_PROMPT_SINGLE if ref == 1 else _SYSTEM_PROMPT_MULTI
    task_line = (
        "Write the individual precedent report as JSON only."
        if ref == 1
        else "Write the comparative precedent study as JSON only."
    )
    user_msg = (
        f"Precedent set ({ref} images):{focus_line}\n\n"
        + "\n\n".join(blocks)
        + f"\n\n{task_line}"
    )

    import asyncio
    from app.services.llm import complete

    loop = asyncio.get_running_loop()
    report_body: dict | None = None
    last_exc: Exception | None = None
    for attempt in range(2):
        # Retry once at temperature 0 — covers occasional malformed JSON output
        temp = 0.2 if attempt == 0 else 0.0
        try:
            raw = await loop.run_in_executor(
                None,
                lambda t=temp: complete(system=system_prompt, user=user_msg, temperature=t, max_tokens=2400),
            )
            report_body = _parse_report_json(raw)
            break
        except Exception as exc:
            last_exc = exc
            logger.warning("report_generation_attempt_failed", attempt=attempt, error=str(exc))
    if report_body is None:
        logger.error("report_generation_failed", error=str(last_exc))
        raise HTTPException(status_code=502, detail=f"Report generation failed: {last_exc}")

    report_json = {
        "sections": report_body["sections"],
        "images": manifest,
        "focus": req.focus,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    record = Report(
        id=uuid.uuid4(),
        cache_key=cache_key,
        image_ids=req.image_ids,
        focus=req.focus,
        report_json=report_json,
    )
    try:
        db.add(record)
        db.commit()
    except IntegrityError:
        # Concurrent identical request won the unique cache_key race — serve its row
        db.rollback()
        existing = db.query(Report).filter(Report.cache_key == cache_key).first()
        if existing is not None:
            return {"report_id": str(existing.id), "cached": True, **existing.report_json}
        raise

    return {"report_id": str(record.id), "cached": False, **report_json}


@router.post("/reports/single")
async def generate_single_precedent_report(
    req: SinglePrecedentRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Single-image precedent report using full frontend metadata context."""
    img: Image | None = None
    try:
        img = db.query(Image).filter(Image.id == uuid.UUID(req.image_id)).first()
    except ValueError:
        pass

    if img is not None:
        artifacts = _image_report_artifacts(img)
        identity = _image_identity(img)
        display_title = _image_display_title(img)
    else:
        artifacts = {}
        identity = {}
        display_title = req.metadata_context.get("title") or "Untitled building"

    # Overlay rich frontend metadata on top of DB artifacts
    ctx = req.metadata_context
    if ctx.get("title") and not artifacts.get("title"):
        artifacts["title"] = ctx["title"]
    if ctx.get("description") and not artifacts.get("description"):
        artifacts["description"] = ctx["description"]
    if ctx.get("explanation") and not artifacts.get("description"):
        artifacts["description"] = ctx["explanation"]
    if ctx.get("building_type") and not artifacts.get("building_type"):
        artifacts["building_type"] = ctx["building_type"]
    if ctx.get("style_classified"):
        style = artifacts.get("style") if isinstance(artifacts.get("style"), dict) else {}
        style.setdefault("primary", ctx["style_classified"])
        artifacts["style"] = style
    if ctx.get("style_top") and not artifacts.get("style_classification_candidates"):
        labels = [
            f"{s[0]} ({float(s[1]) * 100:.1f}%)"
            for s in ctx["style_top"]
            if isinstance(s, list) and len(s) >= 2
        ]
        if labels:
            artifacts["style_classification_candidates"] = labels
    if ctx.get("materials") and not _flatten(artifacts.get("materials")):
        artifacts["materials"] = ctx["materials"]
    if ctx.get("structural_system"):
        elements = artifacts.get("architectural_elements") if isinstance(artifacts.get("architectural_elements"), dict) else {}
        elements.setdefault("structural", [ctx["structural_system"]])
        artifacts["architectural_elements"] = elements
    if ctx.get("climate_zone"):
        env = artifacts.get("environment") if isinstance(artifacts.get("environment"), dict) else {}
        env.setdefault("climate_indicators", [ctx["climate_zone"]])
        artifacts["environment"] = env
    if ctx.get("raw_text") and not artifacts.get("search_index_text"):
        artifacts["search_index_text"] = str(ctx["raw_text"])[:1200]
    if ctx.get("tags") and not artifacts.get("retrieval_tags"):
        artifacts["retrieval_tags"] = ctx["tags"]
    if ctx.get("photographer"):
        artifacts.setdefault("photographer", ctx["photographer"])

    # Overlay identity fields
    if not identity.get("name") and ctx.get("title"):
        identity["name"] = ctx["title"]
    if not identity.get("architect") and ctx.get("architect"):
        identity["architect"] = ctx["architect"]
    if not identity.get("year_built") and ctx.get("year_built"):
        identity["year_built"] = ctx["year_built"]
    if not identity.get("location") and ctx.get("location"):
        identity["location"] = ctx["location"]

    cache_key = hashlib.sha256(
        json.dumps(
            {"single_image_id": req.image_id, "context": req.metadata_context, "focus": req.focus, "v": 1},
            sort_keys=True,
            default=str,
        ).encode()
    ).hexdigest()

    cached = db.query(Report).filter(Report.cache_key == cache_key).first()
    if cached is not None:
        return {"report_id": str(cached.id), "cached": True, **cached.report_json}

    summary = _artifact_summary(artifacts, identity)
    focus_line = f"\nFocus: {_FOCUS_HINTS[req.focus]}" if req.focus else ""
    user_msg = (
        f"Building for individual precedent report:{focus_line}\n\n"
        f"[IMG-1]\n{summary}\n\n"
        "Write the detailed individual precedent report as JSON only."
    )

    manifest = [{
        "ref": 1,
        "image_id": req.image_id if img else None,
        "title": display_title,
        "image_url": f"/images/{req.image_id}/raw" if img else None,
    }]

    import asyncio
    from app.services.llm import complete

    loop = asyncio.get_running_loop()
    report_body: dict | None = None
    last_exc: Exception | None = None
    for attempt in range(2):
        temp = 0.2 if attempt == 0 else 0.0
        try:
            raw = await loop.run_in_executor(
                None,
                lambda t=temp: complete(
                    system=_SYSTEM_PROMPT_SINGLE_DEEP,
                    user=user_msg,
                    temperature=t,
                    max_tokens=3200,
                ),
            )
            report_body = _parse_report_json(raw)
            break
        except Exception as exc:
            last_exc = exc
            logger.warning("single_report_attempt_failed", attempt=attempt, error=str(exc))

    if report_body is None:
        logger.error("single_report_generation_failed", error=str(last_exc))
        raise HTTPException(status_code=502, detail=f"Report generation failed: {last_exc}")

    report_json = {
        "sections": report_body["sections"],
        "images": manifest,
        "focus": req.focus,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    record = Report(
        id=uuid.uuid4(),
        cache_key=cache_key,
        image_ids=[req.image_id],
        focus=req.focus,
        report_json=report_json,
    )
    try:
        db.add(record)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Report).filter(Report.cache_key == cache_key).first()
        if existing is not None:
            return {"report_id": str(existing.id), "cached": True, **existing.report_json}
        raise

    return {"report_id": str(record.id), "cached": False, **report_json}


@router.get("/reports/{report_id}")
async def get_report(report_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    record = db.query(Report).filter(Report.id == report_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report_id": str(record.id), "cached": True, **record.report_json}


# ── PDF rendering ─────────────────────────────────────────────────────────────

_MD_BOLD = re.compile(r"\*\*(.+?)\*\*")
_MD_ITALIC = re.compile(r"(?<!\*)\*([^*]+?)\*(?!\*)")
_IMG_REF = re.compile(r"\[IMG-(\d+)\]")


_UNICODE_SUBS: list[tuple[str, str]] = [
    # Dashes / hyphens
    ("‑", "-"),   # non-breaking hyphen
    ("‒", "-"),   # figure dash
    ("–", "-"),   # en dash
    ("—", "--"),  # em dash
    ("―", "--"),  # horizontal bar
    # Quotes
    ("‘", "'"), ("’", "'"),   # curly single
    ("“", '"'), ("”", '"'),   # curly double
    ("′", "'"), ("″", '"'),   # prime / double prime
    # Ellipsis / bullets
    ("…", "..."),
    ("•", "-"),   # bullet
    ("·", "-"),   # middle dot
    # Spaces
    (" ", " "),   # non-breaking space
    (" ", " "),   # narrow no-break space
    (" ", " "),   # thin space
]


def _latin1_safe(text: str) -> str:
    """Replace common non-Latin-1 chars that crash ReportLab built-in fonts."""
    for src, dst in _UNICODE_SUBS:
        text = text.replace(src, dst)
    # Drop any remaining non-Latin-1 characters
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _md_to_rl(text: str) -> str:
    """Minimal markdown → reportlab inline markup."""
    from xml.sax.saxutils import escape

    text = _latin1_safe(text)
    text = escape(text)
    text = _MD_BOLD.sub(r"<b>\1</b>", text)
    text = _MD_ITALIC.sub(r"<i>\1</i>", text)
    text = _IMG_REF.sub(r'<font color="#B45309" size="8"> [IMG-\1]</font>', text)
    return text


def _thumbnail_bytes(storage_path: str, max_px: int = 360) -> bytes | None:
    from PIL import Image as PILImage

    try:
        with PILImage.open(storage_path) as pil:
            rgb = pil.convert("RGB")
            rgb.thumbnail((max_px, max_px))
            buf = io.BytesIO()
            rgb.save(buf, format="JPEG", quality=80)
            return buf.getvalue()
    except Exception:
        return None


def _data_url_bytes(data_url: str, max_px: int = 360) -> bytes | None:
    if not data_url.startswith("data:image/") or "," not in data_url:
        return None
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=False)
        from PIL import Image as PILImage

        with PILImage.open(io.BytesIO(raw)) as pil:
            rgb = pil.convert("RGB")
            rgb.thumbnail((max_px, max_px))
            buf = io.BytesIO()
            rgb.save(buf, format="JPEG", quality=80)
            return buf.getvalue()
    except Exception:
        return None


@router.get("/reports/{report_id}/pdf")
async def get_report_pdf(
    report_id: uuid.UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    record = db.query(Report).filter(Report.id == report_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Report not found")

    import asyncio

    loop = asyncio.get_running_loop()
    pdf_bytes = await loop.run_in_executor(None, _render_pdf, record, db, settings)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="precedent-report-{record.id}.pdf"',
            "Cache-Control": "public, max-age=86400",
        },
    )


def _render_pdf(record: Report, db: Session, settings: Settings) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        HRFlowable,
        Image as RLImage,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    from app.workers.ingest_worker import _resolve_storage_path

    data = record.report_json
    ink = colors.HexColor("#0F172A")
    accent = colors.HexColor("#B45309")
    muted = colors.HexColor("#64748B")

    h1 = ParagraphStyle("h1", fontName="Times-Bold", fontSize=22, leading=26, textColor=ink, spaceAfter=2)
    eyebrow = ParagraphStyle("eyebrow", fontName="Courier", fontSize=7.5, leading=10, textColor=accent, spaceAfter=6)
    h2 = ParagraphStyle("h2", fontName="Times-Bold", fontSize=14, leading=18, textColor=ink, spaceBefore=14, spaceAfter=4)
    from reportlab.lib.enums import TA_JUSTIFY

    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=14.5, textColor=ink, spaceAfter=6, alignment=TA_JUSTIFY)
    caption = ParagraphStyle("caption", fontName="Courier", fontSize=7, leading=9, textColor=muted)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="Precedent Study",
    )

    story: list = []
    story.append(Paragraph("VISQUERY · COMPARATIVE PRECEDENT STUDY", eyebrow))
    story.append(Paragraph("Precedent Report", h1))
    gen_at = (data.get("generated_at") or "")[:10]
    focus = data.get("focus")
    meta_line = f"Generated {gen_at}" + (f" · Focus: {focus}" if focus else "")
    story.append(Paragraph(meta_line, caption))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.7, color=ink))
    story.append(Spacer(1, 8))

    # Thumbnail strip — one cell per image ref
    thumb_w = 38 * mm
    cells: list = []
    labels: list = []
    for entry in data.get("images", []):
        flowable = None
        if entry.get("image_id"):
            img = db.query(Image).filter(Image.id == uuid.UUID(entry["image_id"])).first()
            if img is not None:
                resolved = _resolve_storage_path(img.storage_path, settings)
                if Path(resolved).exists():
                    raw = _thumbnail_bytes(resolved)
                    if raw:
                        flowable = RLImage(io.BytesIO(raw), width=thumb_w, height=thumb_w * 0.72)
        elif entry.get("image_url"):
            raw = _data_url_bytes(str(entry["image_url"]))
            if raw:
                flowable = RLImage(io.BytesIO(raw), width=thumb_w, height=thumb_w * 0.72)
        if flowable is None:
            placeholder = Table([[""]], colWidths=[thumb_w], rowHeights=[thumb_w * 0.72])
            placeholder.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E2E8F0")),
                ("BOX", (0, 0), (-1, -1), 0.4, muted),
            ]))
            flowable = placeholder
        cells.append(flowable)
        title = _latin1_safe(str(entry.get("title") or ""))[:48]
        labels.append(Paragraph(f"IMG-{entry['ref']} · {title}", caption))

    per_row = 4
    for i in range(0, len(cells), per_row):
        row_cells = cells[i : i + per_row]
        row_labels = labels[i : i + per_row]
        t = Table([row_cells, row_labels], colWidths=[thumb_w + 4 * mm] * len(row_cells))
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 1), (-1, 1), 3),
        ]))
        story.append(t)
        story.append(Spacer(1, 6))

    # Sections
    for sec in data.get("sections", []):
        story.append(Paragraph(_md_to_rl(sec.get("heading", "")), h2))
        story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#CBD5E1")))
        story.append(Spacer(1, 4))
        for para in str(sec.get("body_md", "")).split("\n\n"):
            para = para.strip()
            if not para:
                continue
            # Render markdown list items as separate indented lines
            if para.lstrip().startswith(("- ", "* ")):
                for line in para.splitlines():
                    line = line.strip().lstrip("-*").strip()
                    if line:
                        story.append(Paragraph("•&nbsp;&nbsp;" + _md_to_rl(line), body))
            else:
                story.append(Paragraph(_md_to_rl(para.replace("\n", " ")), body))

    doc.build(story)
    return buf.getvalue()
