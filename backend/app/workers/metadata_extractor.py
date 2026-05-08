"""Building metadata extractor.

Takes scraped text, a structured caption JSON, and optional Wikidata fields.
Returns a structured dict validated against the controlled vocabularies.

Output keys: name, architect, year_built, location_country, location_city,
typology (list), materials (list), structural_system, climate_zone, description.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import structlog
import yaml

logger = structlog.get_logger()

_VOCAB_DIR = Path(__file__).parent.parent / "vocabularies"


def _load_vocab(name: str) -> list[str]:
    path = _VOCAB_DIR / f"{name}.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else list(data)


def extract_building_metadata(
    text_excerpt: str,
    caption_json: dict[str, Any],
    wikidata: dict[str, Any],
    settings,
) -> dict[str, Any]:
    """Call the LLM to extract structured building metadata."""
    typology_vocab = _load_vocab("typology")
    materials_vocab = _load_vocab("materials")
    structural_vocab = _load_vocab("structural")
    climate_vocab = _load_vocab("climate")

    system = _build_system_prompt(typology_vocab, materials_vocab, structural_vocab, climate_vocab)
    user = _build_user_prompt(text_excerpt, caption_json, wikidata)

    from app.services.llm import complete_json

    try:
        raw = complete_json(system=system, user=user, temperature=0.0)
        return _validate_and_clean(raw, typology_vocab, materials_vocab, structural_vocab, climate_vocab)
    except Exception as exc:
        logger.warning("metadata_extraction_failed", error=str(exc))
        return {"name": "Unknown", "description": text_excerpt[:500] if text_excerpt else ""}


def _build_system_prompt(
    typology: list[str],
    materials: list[str],
    structural: list[str],
    climate: list[str],
) -> str:
    return f"""\
You extract structured building metadata from architectural source text.

Controlled vocabularies — only use values from these lists:
Typology: {json.dumps(typology)}
Materials: {json.dumps(materials)}
Structural systems: {json.dumps(structural)}
Climate zones: {json.dumps(climate)}

Return JSON only:
{{
  "name": "building name",
  "architect": "architect name or null",
  "year_built": integer or null,
  "location_country": "country or null",
  "location_city": "city or null",
  "typology": ["value from vocab list"] or [],
  "materials": ["value from vocab list"] or [],
  "structural_system": "value from vocab list or null",
  "climate_zone": "value from vocab list or null",
  "description": "one to two sentence cleaned description"
}}

Rules:
- Only use vocabulary values verbatim. If you cannot match, omit the field.
- Do not invent facts. If information is not present, use null.
- Year must be a four-digit integer if present.
"""


def _build_user_prompt(
    text_excerpt: str,
    caption_json: dict[str, Any],
    wikidata: dict[str, Any],
) -> str:
    parts = []
    if text_excerpt:
        parts.append(f"Source text:\n{text_excerpt[:2000]}")
    if caption_json:
        parts.append(f"Image caption:\n{json.dumps(caption_json, ensure_ascii=False)}")
    if wikidata:
        parts.append(f"Wikidata fields:\n{json.dumps(wikidata, ensure_ascii=False)}")
    return "\n\n".join(parts) or "No source text available."


def _validate_and_clean(
    raw: dict[str, Any],
    typology_vocab: list[str],
    materials_vocab: list[str],
    structural_vocab: list[str],
    climate_vocab: list[str],
) -> dict[str, Any]:
    """Discard any vocabulary values not in the controlled lists."""
    if isinstance(raw.get("typology"), list):
        raw["typology"] = [v for v in raw["typology"] if v in typology_vocab]
    if isinstance(raw.get("materials"), list):
        raw["materials"] = [v for v in raw["materials"] if v in materials_vocab]
    if raw.get("structural_system") and raw["structural_system"] not in structural_vocab:
        raw["structural_system"] = None
    if raw.get("climate_zone") and raw["climate_zone"] not in climate_vocab:
        raw["climate_zone"] = None
    if raw.get("year_built") is not None:
        try:
            raw["year_built"] = int(raw["year_built"])
        except (ValueError, TypeError):
            raw["year_built"] = None
    return raw
