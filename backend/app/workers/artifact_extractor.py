"""Extract structured architectural artifacts from image context via LLM."""
from __future__ import annotations

import json
import re
from typing import Any

_SYSTEM_PROMPT = """
You are an architectural semantic extraction engine.

Goal:
Extract architectural artifacts, visual evidence, environmental context,
and scene metadata from a building description for semantic retrieval and RAG systems.

IMPORTANT:
- Focus on observable architectural evidence from the provided context
- Preserve unique and rare architectural characteristics
- Do NOT over-generalize styles
- Do NOT force classification into limited categories
- Prefer visually grounded observations
- Use concise normalized snake_case labels
- Return valid JSON only — no markdown, no prose outside JSON values
- No hallucinated hidden structures

GUIDELINES:

1. description: Write 2-3 prose sentences capturing the building's character, visual identity, and architectural intent.

2. Canonical artifacts: Use normalized architectural terminology (e.g. pointed_arch, flying_buttress, curtain_wall, ribbed_vault).

3. Emergent artifacts: Preserve unique or uncommon features (e.g. parametric_skin, perforated_facade_pattern, dravidian_tower).

4. Style reasoning: Output style_evidence as visual features that support the primary style classification. Do NOT output a style label alone.

5. Scene metadata: Capture environment, viewpoint, urban density, landscape integration, facade visibility.

6. Spatial reasoning: Capture symmetry, massing, rhythm, repetition, verticality, layering, geometry.

7. Color: Capture dominant architectural colors and material tones.

8. Relationships: Extract observable structural dependencies between components.

OUTPUT SCHEMA (return only this JSON shape, no extra keys):

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
"""


def extract_artifacts_from_context(
    caption_data: dict[str, Any],
    building_meta: dict[str, Any],
    settings: Any,
) -> dict[str, Any]:
    """Run LLM artifact extraction using existing caption + metadata as context."""
    from app.services.llm import complete

    parts: list[str] = []
    if caption_data.get("raw_text"):
        parts.append(f"Visual description: {caption_data['raw_text']}")
    if caption_data.get("title"):
        parts.append(f"Title: {caption_data['title']}")
    if building_meta.get("typology"):
        parts.append(f"Typology: {', '.join(building_meta['typology'])}")
    if building_meta.get("materials"):
        parts.append(f"Materials: {', '.join(building_meta['materials'])}")
    if building_meta.get("structural_system"):
        parts.append(f"Structural system: {building_meta['structural_system']}")
    if caption_data.get("architecture_style_classified"):
        parts.append(f"Style: {caption_data['architecture_style_classified']}")
    if building_meta.get("description"):
        parts.append(f"Description: {building_meta['description']}")

    context = "\n".join(parts) if parts else "Architectural building image."

    user_msg = (
        f"Building context:\n{context}\n\n"
        "Extract all architectural artifacts from this context as JSON only. "
        "Include a short description (2-3 sentences), building_type, full style analysis with evidence, "
        "all architectural elements, materials, spatial features, color palette, environment context, "
        "viewpoint, relationships, semantic_keywords, and retrieval_tags. "
        "Return valid JSON matching the output schema exactly."
    )

    try:
        raw = complete(
            system=_SYSTEM_PROMPT,
            user=user_msg,
            temperature=0.1,
            max_tokens=1400,
        )
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(raw)
    except Exception:
        return {}
