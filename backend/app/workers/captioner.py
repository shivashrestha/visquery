"""Vision LLM captioner.

Generates a structured architectural caption JSON for an image. The caption
drives both full-text search and the synthesizer agent's grounding.

Caption schema:
{
  "element": "facade | plan | section | interior | detail | site",
  "strategy": "compositional strategy description",
  "material": "material articulation description",
  "spatial": "spatial qualities description",
  "structural": "structural expression description",
  "summary": "one to two sentence summary for search and grounding",
  "method": "caption_method_identifier"
}
"""
from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()

_CAPTION_SYSTEM = """\
Describe this architectural image as if for an academic precedent search.
Identify:
1. The building element shown (facade, plan, section, interior, detail, site)
2. Compositional strategy (asymmetry, layering, datum lines, repetition, etc.)
3. Material articulation (texture, joints, weathering, surface treatment)
4. Spatial qualities (compression, expansion, hierarchy, sequence)
5. Structural expression (visible structure, concealed structure, hybrid)

Be specific about architectural ideas. If uncertain, say so.
Never invent facts not visible in the image.

Return JSON only:
{
  "element": "...",
  "strategy": "...",
  "material": "...",
  "spatial": "...",
  "structural": "...",
  "summary": "one to two sentences for search and citation grounding"
}
"""


def caption_image(storage_path: str, settings) -> dict[str, Any]:
    """Call the configured vision LLM and return the structured caption dict."""
    path = Path(storage_path)
    if not path.exists():
        raise FileNotFoundError(storage_path)

    image_data = base64.standard_b64encode(path.read_bytes()).decode()
    suffix = path.suffix.lower()
    media_type_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    media_type = media_type_map.get(suffix, "image/jpeg")

    if settings.llm_provider == "anthropic":
        return _caption_anthropic(image_data, media_type, settings.anthropic_api_key)
    else:
        return _caption_ollama(storage_path, settings.ollama_base_url, settings.ollama_model)


def _caption_anthropic(image_data: str, media_type: str, api_key: str) -> dict[str, Any]:
    import json

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=512,
        system=_CAPTION_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": "Describe this architectural image."},
                ],
            }
        ],
    )
    raw = message.content[0].text.strip()
    result = _parse_json_safe(raw)
    result["method"] = "claude-haiku-4-5"
    return result


def _caption_ollama(storage_path: str, base_url: str, model: str) -> dict[str, Any]:
    """Use Ollama with a multimodal model (e.g. llava or qwen2-vl)."""
    import json

    import httpx

    path = Path(storage_path)
    image_b64 = base64.standard_b64encode(path.read_bytes()).decode()

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": _CAPTION_SYSTEM + "\n\nDescribe this architectural image.",
                "images": [image_b64],
            }
        ],
        "stream": False,
        "options": {"temperature": 0.0},
    }

    with httpx.Client(timeout=120) as client:
        resp = client.post(f"{base_url.rstrip('/')}/api/chat", json=payload)
        resp.raise_for_status()

    raw = resp.json()["message"]["content"].strip()
    result = _parse_json_safe(raw)
    result["method"] = f"ollama/{model}"
    return result


def _parse_json_safe(raw: str) -> dict[str, Any]:
    import json

    # Strip markdown fences
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("caption_json_parse_failed", raw_preview=raw[:200])
        return {"summary": raw, "element": "", "strategy": "", "material": "", "spatial": "", "structural": ""}
