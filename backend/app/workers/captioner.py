# captioner.py
"""
Architectural image captioning pipeline optimized for:

- architectural precedent search
- RAG / semantic retrieval
- dense architectural style tagging
- low hallucination
- fast queue processing
- single-model inference
- ontology normalization

Pipeline:
Image
 -> Qwen3-VL 235B
 -> structured architectural metadata
 -> normalization layer
 -> finetuned CLIP zero-shot style classification

Output schema:
{
  "view_type": "",
  "architectural_style": [],
  "materials": [],
  "structure": [],
  "composition": [],
  "spatial_features": [],
  "lighting": [],
  "program_hints": [],
  "tags": [],
  "caption": "",
  "embedding_text": "",
  "raw_visual_description": "",
  "identity": {
      "building_name": null,
      "confidence": 0.0
  },
  "architecture_style_classified": "",
  "architecture_style_top": [],
  "method": ""
}
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from typing import Any

import structlog
from ollama import Client

logger = structlog.get_logger()

# Architecture styles the finetuned CLIP model was trained to recognise
_STYLES_PATH = Path(__file__).parent / "architecture_styles.json"
_ARCHITECTURE_STYLES: list[str] = json.loads(_STYLES_PATH.read_text(encoding="utf-8"))


# -------------------------------------------------------------------
# PROMPT
# -------------------------------------------------------------------

_CAPTION_PROMPT = """
You are generating architectural retrieval metadata for a precedent image database.

Analyze the image and return ONLY valid JSON.

PRIMARY GOAL:
Generate dense architectural retrieval information suitable for:
- semantic search
- architectural precedent discovery
- style-based filtering
- material and composition retrieval

RULES:
- Describe only visible architectural evidence.
- Prefer observable features over interpretation.
- Avoid poetic or conceptual language.
- Use concise architectural terminology.
- Do not speculate about architect or location.
- Building name should only appear if highly recognizable.
- Avoid redundancy.
- Focus strongly on architectural style and visual characteristics.

Return concise, information-dense output.

Schema:
{
  "view_type": "",
  "architectural_style": [],
  "materials": [],
  "structure": [],
  "composition": [],
  "spatial_features": [],
  "lighting": [],
  "program_hints": [],
  "tags": [],
  "caption": "",
  "embedding_text": "",
  "raw_visual_description": "",
  "identity": {
      "building_name": null,
      "confidence": 0.0
  }
}

Field guidelines:

view_type:
- facade
- interior
- detail
- section
- plan
- site
- perspective
- axonometric
- elevation

architectural_style:
Only if visually supported.
Examples:
- brutalist
- modernist
- postmodern
- vernacular
- contemporary
- industrial
- minimalist
- gothic
- baroque
- deconstructivist
- high-tech
- art deco
- bauhaus
- international style
- neo-futurist
- parametric

materials:
Short architectural material phrases.
Examples:
- exposed concrete
- board-formed concrete
- weathered steel
- glass curtain wall
- timber cladding
- stone facade
- perforated metal

structure:
Examples:
- exposed frame
- cantilever
- shell roof
- truss structure
- pilotis
- load-bearing wall
- space frame

composition:
Examples:
- vertical rhythm
- repetitive bays
- monolithic massing
- deep reveals
- symmetry
- asymmetry
- layered facade
- horizontal emphasis
- recessed glazing

spatial_features:
Examples:
- atrium
- courtyard
- double-height
- open plan
- layered depth
- split-level
- compression and expansion

lighting:
Examples:
- diffuse daylight
- dramatic shadows
- filtered light
- top lighting
- backlit interior

program_hints:
Examples:
- residential
- civic
- museum
- religious
- industrial
- institutional
- commercial
- cultural

tags:
Dense architectural retrieval tags.
Maximum 20.
Prefer atomic phrases.

caption:
One concise retrieval-oriented sentence.

embedding_text:
Compact semantic-search text under 80 words.
Should combine:
- style
- materials
- structure
- composition
- spatial qualities

raw_visual_description:
Dense architectural prose describing visible features.

identity:
Only include building name if highly recognizable.
Otherwise:
{
  "building_name": null,
  "confidence": 0.0
}
"""


# -------------------------------------------------------------------
# NORMALIZATION
# -------------------------------------------------------------------

NORMALIZATION_MAP = {
    # Concrete
    "raw concrete": "exposed concrete",
    "unfinished concrete": "exposed concrete",
    "fair-faced concrete": "exposed concrete",
    "board formed concrete": "board-formed concrete",

    # Glass
    "glass facade": "glass curtain wall",
    "curtain glazing": "glass curtain wall",

    # Metal
    "metal cladding": "metal panels",

    # Structure
    "visible frame": "exposed frame",

    # Composition
    "repetitive facade": "repetitive bays",
    "recessed windows": "deep reveals",

    # Styles
    "modern": "modernist",
    "neo brutalist": "brutalist",
}


# -------------------------------------------------------------------
# ARCHITECTURE STYLE CLASSIFIER (finetuned CLIP zero-shot)
# -------------------------------------------------------------------

def classify_architecture_style(
    storage_path: str,
    top_k: int = 3,
) -> dict[str, Any]:
    """
    Zero-shot classify image against architecture styles using finetuned CLIP.

    Returns:
        {
            "architecture_style_classified": "<best match>",
            "architecture_style_top": [["style", score], ...],
        }
    """
    from app.services.embedder import embed_image_from_path, embed_texts

    img_vec = embed_image_from_path(storage_path)          # (512,) L2-normed
    style_vecs = embed_texts(_ARCHITECTURE_STYLES)          # (N, 512) L2-normed
    scores = (style_vecs @ img_vec).tolist()                # cosine similarities

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

def caption_image(storage_path: str, settings) -> dict[str, Any]:
    """
    Generate architectural retrieval metadata from image.
    """

    path = Path(storage_path)

    if not path.exists():
        raise FileNotFoundError(f"Image not found: {storage_path}")

    image_b64 = (
        base64.standard_b64encode(path.read_bytes())
        .decode()
    )

    headers = {}

    if settings.ollama_api_key:
        headers["Authorization"] = (
            f"Bearer {settings.ollama_api_key}"
        )

    client = Client(
        host=settings.ollama_base_url,
        headers=headers,
    )

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

    logger.info(
        "architectural_caption_generated",
        preview=raw[:300],
    )

    result = _parse_json_safe(raw)
    result = _normalize_result(result)
    result["method"] = f"ollama/{settings.ollama_vlm_model}"

    # CLIP-based style classification using finetuned model
    try:
        style_result = classify_architecture_style(storage_path)
        result.update(style_result)
        logger.info(
            "architecture_style_classified",
            style=style_result.get("architecture_style_classified"),
        )
    except Exception as exc:
        logger.warning("architecture_style_classification_failed", error=str(exc))
        result["architecture_style_classified"] = ""
        result["architecture_style_top"] = []

    return result


# -------------------------------------------------------------------
# NORMALIZATION
# -------------------------------------------------------------------

def _normalize_result(
    result: dict[str, Any]
) -> dict[str, Any]:
    """
    Normalize ontology vocabulary.
    """

    fields = [
        "architectural_style",
        "materials",
        "structure",
        "composition",
        "spatial_features",
        "lighting",
        "program_hints",
        "tags",
    ]

    for field in fields:

        values = result.get(field, [])

        if not isinstance(values, list):
            values = []

        normalized = []

        for value in values:

            if not value:
                continue

            value = (
                value
                .strip()
                .lower()
            )

            value = NORMALIZATION_MAP.get(
                value,
                value,
            )

            normalized.append(value)

        # dedupe while preserving order
        result[field] = list(
            dict.fromkeys(normalized)
        )

    return result


# -------------------------------------------------------------------
# JSON PARSER
# -------------------------------------------------------------------

_EMPTY_RESULT: dict[str, Any] = {
    "view_type": "",
    "architectural_style": [],
    "materials": [],
    "structure": [],
    "composition": [],
    "spatial_features": [],
    "lighting": [],
    "program_hints": [],
    "tags": [],
    "caption": "",
    "embedding_text": "",
    "raw_visual_description": "",
    "identity": {
        "building_name": None,
        "confidence": 0.0,
    },
    "architecture_style_classified": "",
    "architecture_style_top": [],
}


def _parse_json_safe(
    raw: str
) -> dict[str, Any]:
    """
    Safely parse model JSON output.

    Handles:
    - Qwen3 <think>...</think> reasoning blocks preceding JSON
    - Markdown code fences
    - JSON embedded in surrounding prose (extracts first {...} block)
    """

    raw = raw.strip()

    # Strip Qwen3 / reasoning model thinking blocks
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

    # Remove markdown fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    # Attempt 1: direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Attempt 2: extract first top-level {...} block
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    logger.warning(
        "caption_json_parse_failed",
        raw_preview=raw[:500],
    )

    return {**_EMPTY_RESULT, "parse_error": True, "raw_response": raw[:2000]}