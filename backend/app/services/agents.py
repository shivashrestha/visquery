"""LLM agent functions: router, rewriter, synthesizer.

These are deterministic agentic workflows — the control flow is fixed in Python;
only the LLM outputs vary. No autonomous tool use.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import structlog

from app.services import llm as llm_client

logger = structlog.get_logger()

_PROMPT_DIR = Path(__file__).parent.parent / "prompts"

VALID_INTENTS = {"concept_search", "visual_reference", "metadata_only", "hybrid"}


def _read_prompt(name: str) -> str:
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


def route(query: str) -> dict[str, Any]:
    """Classify query intent using a small/cheap model (Claude Haiku).

    Returns {"intent": str, "features": dict}.
    """
    system = _read_prompt("router.txt")
    user = f"Query: {query}"

    try:
        result = llm_client.complete_json(
            system=system,
            user=user,
            model_override="claude-haiku-4-5",
            temperature=0.0,
        )
        intent = result.get("intent", "concept_search")
        if intent not in VALID_INTENTS:
            intent = "concept_search"
        return {"intent": intent, "features": result.get("features", {})}
    except Exception as exc:
        logger.warning("router_failed", error=str(exc))
        return {"intent": "concept_search", "features": {}}


def rewrite(query: str, intent: str) -> dict[str, Any]:
    """Decompose a query into visual descriptions, keywords, and filters.

    Returns the rewriter JSON as defined in the prompt template.
    Falls back to a single-element visual_descriptions list on failure.
    """
    system = _read_prompt("rewriter.txt")
    user = f"Intent: {intent}\nUser query: {query}"

    try:
        result = llm_client.complete_json(
            system=system,
            user=user,
            temperature=0.0,
        )
        # Clamp to 3 visual descriptions max
        vd = result.get("visual_descriptions", [query])
        result["visual_descriptions"] = vd[:3]
        return result
    except Exception as exc:
        logger.warning("rewriter_failed", error=str(exc))
        return {
            "visual_descriptions": [query],
            "keywords": [],
            "filters": {},
        }


def synthesize(query: str, results: list[dict[str, Any]]) -> list[str]:
    """Generate one-sentence grounded explanations for each result.

    Returns a list of explanations aligned with the input results list.
    Returns empty strings for any result where synthesis fails.
    """
    system = _read_prompt("synthesizer.txt")
    explanations: list[str] = []

    for result in results:
        building_meta = result.get("metadata", {})
        source_excerpt = result.get("source_excerpt", "")

        user = (
            f"Query: {query}\n"
            f"Building metadata: {json.dumps(building_meta, ensure_ascii=False)}\n"
            f"Source excerpt: {source_excerpt}"
        )

        try:
            text = llm_client.complete(
                system=system,
                user=user,
                temperature=0.0,
                max_tokens=80,
            )
            explanations.append(text.strip())
        except Exception as exc:
            logger.warning("synthesizer_failed_for_result", error=str(exc))
            explanations.append("")

    return explanations
