"""Direct architectural artifact extraction from images via VLM.

Single VLM call produces structured artifacts JSON + title.
Replaces the old caption + metadata_extractor two-stage pipeline.
"""
from __future__ import annotations

import base64
import io
import json
import re
import threading
import time
from pathlib import Path
from typing import Any, Optional

import numpy as np
import structlog
from ollama import Client
import ollama
from PIL import Image as PILImage

logger = structlog.get_logger()

_STYLES_PATH = Path(__file__).parent / "architecture_styles.json"
_ARCHITECTURE_STYLES: list[str] = json.loads(_STYLES_PATH.read_text(encoding="utf-8"))

_STYLE_VECS: Optional[np.ndarray] = None
_STYLE_VECS_LOCK = threading.Lock()


def _get_style_vecs() -> np.ndarray:
    global _STYLE_VECS
    if _STYLE_VECS is not None:
        return _STYLE_VECS
    with _STYLE_VECS_LOCK:
        if _STYLE_VECS is None:
            from app.services.embedder import embed_texts
            _STYLE_VECS = embed_texts(_ARCHITECTURE_STYLES)
    return _STYLE_VECS


_VLM_MAX_DIM = 768
_VLM_MAX_BYTES = 512 * 1024  # 512 KB — VLMs patch internally to 336-448px anyway
try:
    _RESAMPLE = PILImage.Resampling.LANCZOS
except AttributeError:
    _RESAMPLE = PILImage.LANCZOS  # type: ignore[attr-defined]


def _optimize_for_vlm(image_bytes: bytes) -> bytes:
    """Resize + JPEG-compress image for fast VLM inference."""
    pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = pil.size

    if max(w, h) > _VLM_MAX_DIM:
        scale = _VLM_MAX_DIM / max(w, h)
        pil = pil.resize((int(w * scale), int(h * scale)), _RESAMPLE)

    quality = 85
    while True:
        buf = io.BytesIO()
        pil.save(buf, "JPEG", optimize=True, quality=quality)
        if buf.tell() <= _VLM_MAX_BYTES or quality <= 55:
            buf.seek(0)
            return buf.read()
        quality -= 10


_ARTIFACT_PROMPT = """Analyze this architectural image and extract structured artifacts as JSON.

Return exactly this JSON shape (no extra keys, no markdown):
{
  "title": "one concise sentence — style, program, key feature (under 15 words)",
  "description": "2-3 sentences: building character, notable visual qualities, architectural intent",
  "building_type": "<residential|cultural|religious|commercial|civic|institutional|industrial|infrastructure|landscape>",
  "style": {
    "primary": "<style_label>",
    "secondary": [],
    "confidence": 0.0,
    "style_evidence": [],
    "emergent_tags": []
  },
  "architectural_elements": {
    "structural": [],
    "facade": [],
    "roofing": [],
    "openings": [],
    "ornamental": [],
    "circulation": []
  },
  "materials": [],
  "material_details": {
    "textures": [],
    "construction_expression": []
  },
  "spatial_features": {
    "massing": [],
    "geometry": [],
    "symmetry": [],
    "rhythm": [],
    "depth_layering": []
  },
  "color_palette": {
    "dominant": [],
    "accent": [],
    "material_tones": []
  },
  "environment": {
    "setting": [],
    "urban_context": [],
    "landscape": [],
    "climate_indicators": []
  },
  "viewpoint": {
    "camera_angle": "",
    "view_type": "",
    "facade_visibility": ""
  },
  "relationships": [
    {"source": "<element>", "relation": "<relation_type>", "target": "<element>"}
  ],
  "semantic_keywords": [],
  "retrieval_tags": []
}

Rules:
- Use normalized architectural ontology tags only (lowercase_underscored labels)
- No prose, no explanations outside the JSON values
- description: 2-3 prose sentences about the building's character and visual identity
- style_evidence: list of visual features that support the primary style classification
- emergent_tags: unique or rare architectural features not covered by canonical style labels
- confidence: float 0.0-1.0 based on visual clarity
- materials: flat list of primary material names (e.g. reinforced_concrete, glass_curtain_wall)
- retrieval_tags: 5-10 concise tags optimized for semantic search and discovery
- relationships: only when a structural dependency is clearly visible
- Output valid JSON only
"""


def _run_vlm_extraction(
    image_b64: str,
    settings: Any,
    image_vec: Optional[np.ndarray],
    enrich_style: bool,
) -> dict[str, Any]:
    local_mode: bool = getattr(settings, "local_mode", False)

    if local_mode:
        base_url = getattr(settings, "local_ollama_base_url", "http://localhost:11434") or "http://localhost:11434"
        model = getattr(settings, "local_model_name", "") or "gemma4:e4b"
        client = Client(host=base_url)
        logger.info("vlm_local_mode", model=model, base_url=base_url)
    else:
        headers: dict = {}
        if settings.ollama_api_key:
            headers["Authorization"] = f"Bearer {settings.ollama_api_key}"
        base_url = settings.ollama_base_url
        model = settings.ollama_vlm_model
        client = Client(host=base_url, headers=headers)
        logger.info("vlm_cloud_mode", model=model, base_url=base_url)

    try:
        t0 = time.monotonic()
        response = client.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": _ARTIFACT_PROMPT,
                    "images": [image_b64],
                }
            ],
            options={
                "temperature": 0.1,
                "top_p": 0.9,
                "think": False,
                "num_predict": 1024,
                "num_ctx": 4096,
            },
        )
        elapsed = round(time.monotonic() - t0, 2)
        raw = (response.message.content or "").strip()
        logger.info("vlm_inference_done", elapsed_s=elapsed, payload_kb=round(len(image_b64) * 3 / 4 / 1024))
        logger.info("vlm_artifacts_generated", preview=raw[:200])
        result = _parse_json_safe(raw)
        result["method"] = f"ollama-local/{model}" if local_mode else f"ollama-cloud/{model}"
    except Exception as vlm_exc:
        logger.warning("vlm_chat_failed_using_clip_fallback", error=str(vlm_exc))
        result = {**_EMPTY, "vlm_unavailable": True}

    # Enrich style with CLIP zero-shot classification when vec is available
    if enrich_style and image_vec is not None:
        try:
            style_vecs = _get_style_vecs()
            scores = (style_vecs @ image_vec).tolist()
            ranked = sorted(zip(_ARCHITECTURE_STYLES, scores), key=lambda x: x[1], reverse=True)
            top = [[s, round(float(sc), 4)] for s, sc in ranked[:3]]
            if top:
                if not isinstance(result.get("style"), dict):
                    result["style"] = {}
                if not result["style"].get("primary"):
                    result["style"]["primary"] = top[0][0]
                if not result["style"].get("confidence"):
                    result["style"]["confidence"] = round(top[0][1], 4)
                result["architecture_style_classified"] = top[0][0]
                result["architecture_style_top"] = top
        except Exception as exc:
            logger.warning("style_enrichment_failed", error=str(exc))

    return result


def extract_image_artifacts(
    storage_path: str,
    settings: Any,
    image_vec: Optional[np.ndarray] = None,
    enrich_style: bool = True,
) -> dict[str, Any]:
    """Extract artifacts from image file via VLM. Returns title + full artifact structure."""
    path = Path(storage_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {storage_path}")
    raw = _optimize_for_vlm(path.read_bytes())
    image_b64 = base64.standard_b64encode(raw).decode()
    return _run_vlm_extraction(image_b64, settings, image_vec, enrich_style)


def extract_image_artifacts_from_bytes(
    image_bytes: bytes,
    settings: Any,
    image_vec: Optional[np.ndarray] = None,
    enrich_style: bool = True,
) -> dict[str, Any]:
    """Extract artifacts from raw image bytes via VLM (no temp file needed)."""
    optimized = _optimize_for_vlm(image_bytes)
    image_b64 = base64.standard_b64encode(optimized).decode()
    return _run_vlm_extraction(image_b64, settings, image_vec, enrich_style)


_EMPTY: dict[str, Any] = {
    "title": "",
    "description": "",
    "building_type": "",
    "style": {"primary": "", "secondary": [], "confidence": 0.0, "style_evidence": [], "emergent_tags": []},
    "architectural_elements": {"structural": [], "facade": [], "roofing": [], "openings": [], "ornamental": [], "circulation": []},
    "materials": [],
    "material_details": {"textures": [], "construction_expression": []},
    "spatial_features": {"massing": [], "geometry": [], "symmetry": [], "rhythm": [], "depth_layering": []},
    "color_palette": {"dominant": [], "accent": [], "material_tones": []},
    "environment": {"setting": [], "urban_context": [], "landscape": [], "climate_indicators": []},
    "viewpoint": {"camera_angle": "", "view_type": "", "facade_visibility": ""},
    "relationships": [],
    "semantic_keywords": [],
    "retrieval_tags": [],
}


def _parse_json_safe(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.warning("artifact_json_parse_failed", raw_preview=raw[:500])
    return {**_EMPTY, "parse_error": True}
