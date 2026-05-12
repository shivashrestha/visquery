"""Building metadata extractor.

Takes scraped text, a structured caption JSON, and optional Wikidata fields.
Returns a structured dict with name, architect, year_built, location_country,
location_city, typology (list), materials (list), structural_system,
climate_zone, description.
"""
from __future__ import annotations

import json
from typing import Any

import structlog

logger = structlog.get_logger()


def extract_building_metadata(
    text_excerpt: str,
    caption_json: dict[str, Any],
    wikidata: dict[str, Any],
    settings,
) -> dict[str, Any]:
    """Call the LLM to extract structured building metadata."""
    system = """\
You extract structured building metadata from architectural source text.

Return JSON only:
{
  "name": "building name",
  "architect": "architect name or null",
  "year_built": integer or null,
  "location_country": "country or null",
  "location_city": "city or null",
  "typology": ["list of typology labels"] or [],
  "materials": ["list of primary materials"] or [],
  "structural_system": "structural system description or null",
  "climate_zone": "climate zone or null",
  "description": "one to two sentence cleaned description"
}

Rules:
- Do not invent facts. If information is not present, use null.
- Year must be a four-digit integer if present.
"""

    parts = []
    if text_excerpt:
        parts.append(f"Source text:\n{text_excerpt[:2000]}")
    if caption_json:
        parts.append(f"Image caption:\n{json.dumps(caption_json, ensure_ascii=False)}")
    if wikidata:
        parts.append(f"Wikidata fields:\n{json.dumps(wikidata, ensure_ascii=False)}")
    user = "\n\n".join(parts) or "No source text available."

    from app.services.llm import complete_json

    try:
        raw = complete_json(system=system, user=user, temperature=0.0)
        if raw.get("year_built") is not None:
            try:
                raw["year_built"] = int(raw["year_built"])
            except (ValueError, TypeError):
                raw["year_built"] = None
        return raw
    except Exception as exc:
        logger.warning("metadata_extraction_failed", error=str(exc))
        return {"name": "Unknown", "description": text_excerpt[:500] if text_excerpt else ""}
