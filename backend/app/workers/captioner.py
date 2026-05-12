# captioner.py
"""
Minimal architectural image captioning pipeline.

Pipeline:
  Image -> VLM -> {title, description, raw_text}
               -> finetuned CLIP zero-shot style classification

Output schema:
{
  "title": "",
  "description": "",
  "raw_text": "",
  "architecture_style_classified": "",
  "architecture_style_top": [],
  "method": ""
}
"""

from __future__ import annotations

import base64
import json
import re
import threading
from pathlib import Path
from typing import Any, Optional

import numpy as np
import structlog
from ollama import Client

logger = structlog.get_logger()

_STYLES_PATH = Path(__file__).parent / "architecture_styles.json"
_ARCHITECTURE_STYLES: list[str] = json.loads(_STYLES_PATH.read_text(encoding="utf-8"))

# Cache style embeddings — computed once, reused across all caption calls.
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


# -------------------------------------------------------------------
# PROMPT
# -------------------------------------------------------------------

_CAPTION_PROMPT = """You are analyzing an architectural image for a precedent search database.

Return ONLY valid JSON with exactly these three fields:

{
  "title": "one concise sentence identifying the image — style, program, key feature",
  "description": "two to three sentences on visible architectural character, materials, and spatial qualities",
  "raw_text": "dense retrieval text under 120 words — pack in style, materials, structure, composition, spatial features, program, and any identifiable building or architect"
}

Rules:
- No markdown, no prose outside JSON.
- title: one sentence, under 15 words.
- description: observable facts only, no speculation.
- raw_text: optimized for semantic search — dense, no filler.
"""


# -------------------------------------------------------------------
# ARCHITECTURE STYLE CLASSIFIER
# -------------------------------------------------------------------

def classify_architecture_style(
    storage_path: str,
    top_k: int = 3,
    image_vec: Optional[np.ndarray] = None,
) -> dict[str, Any]:
    """Zero-shot classify image against architecture styles using finetuned CLIP.

    Pass image_vec to skip re-embedding (avoids duplicate CLIP inference).
    """
    from app.services.embedder import embed_image_from_path

    if image_vec is None:
        image_vec = embed_image_from_path(storage_path)

    style_vecs = _get_style_vecs()
    scores = (style_vecs @ image_vec).tolist()

    ranked = sorted(
        zip(_ARCHITECTURE_STYLES, scores),
        key=lambda x: x[1],
        reverse=True,
    )
    top = [[s, round(float(sc), 4)] for s, sc in ranked[:top_k]]

    return {
        "architecture_style_classified": top[0][0] if top else "",
        "architecture_style_top": top,
    }


# -------------------------------------------------------------------
# MAIN
# -------------------------------------------------------------------

def caption_image(
    storage_path: str,
    settings,
    image_vec: Optional[np.ndarray] = None,
    classify_style: bool = True,
) -> dict[str, Any]:
    """Generate title, description, raw_text from image via VLM.

    Pass image_vec to avoid duplicate CLIP inference.
    Set classify_style=False to skip style classification entirely (no CLIP load).
    """
    path = Path(storage_path)
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {storage_path}")

    image_b64 = base64.standard_b64encode(path.read_bytes()).decode()

    headers = {}
    if settings.ollama_api_key:
        headers["Authorization"] = f"Bearer {settings.ollama_api_key}"

    client = Client(host=settings.ollama_base_url, headers=headers)

    response = client.chat(
        model=settings.ollama_vlm_model,
        messages=[
            {
                "role": "user",
                "content": _CAPTION_PROMPT,
                "images": [image_b64],
            }
        ],
        options={
            "temperature": 0.1,
            "top_p": 0.9,
            "think": False,
        },
    )

    raw = (response.message.content or "").strip()
    logger.info("vlm_caption_generated", preview=raw[:200])

    result = _parse_json_safe(raw)
    result["method"] = f"ollama/{settings.ollama_vlm_model}"

    if classify_style:
        try:
            style_result = classify_architecture_style(storage_path, image_vec=image_vec)
            result.update(style_result)
            logger.info("style_classified", style=style_result.get("architecture_style_classified"))
        except Exception as exc:
            logger.warning("style_classification_failed", error=str(exc))
            result["architecture_style_classified"] = ""
            result["architecture_style_top"] = []
    else:
        result["architecture_style_classified"] = ""
        result["architecture_style_top"] = []

    return result


# -------------------------------------------------------------------
# JSON PARSER
# -------------------------------------------------------------------

_EMPTY_RESULT: dict[str, Any] = {
    "title": "",
    "description": "",
    "raw_text": "",
    "architecture_style_classified": "",
    "architecture_style_top": [],
}


def _parse_json_safe(raw: str) -> dict[str, Any]:
    """Parse VLM JSON output. Handles think blocks, markdown fences, embedded JSON."""
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

    logger.warning("caption_json_parse_failed", raw_preview=raw[:500])
    return {**_EMPTY_RESULT, "parse_error": True, "raw_response": raw[:2000]}
