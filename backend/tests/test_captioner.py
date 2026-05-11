"""Smoke tests for captioner.py — no Ollama required."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.workers.captioner import _normalize_result, _parse_json_safe, caption_image


# ---------------------------------------------------------------------------
# _parse_json_safe
# ---------------------------------------------------------------------------

def test_parse_json_safe_plain():
    raw = json.dumps({"caption": "test", "tags": ["brutalist"]})
    result = _parse_json_safe(raw)
    assert result["caption"] == "test"
    assert result["tags"] == ["brutalist"]


def test_parse_json_safe_markdown_fences():
    raw = "```json\n{\"caption\": \"fenced\"}\n```"
    result = _parse_json_safe(raw)
    assert result["caption"] == "fenced"


def test_parse_json_safe_bad_json_returns_fallback():
    result = _parse_json_safe("not valid json {{")
    assert result["caption"] == ""
    assert result.get("parse_error") is True


def test_parse_json_safe_strips_think_blocks():
    payload = {"caption": "brutalist facade", "tags": ["brutalist"]}
    raw = f"<think>\nLet me analyze this image carefully.\n</think>\n{json.dumps(payload)}"
    result = _parse_json_safe(raw)
    assert result["caption"] == "brutalist facade"
    assert "parse_error" not in result


def test_parse_json_safe_extracts_json_from_prose():
    payload = {"caption": "glass tower", "tags": []}
    raw = f"Here is the JSON output:\n{json.dumps(payload)}\nEnd of output."
    result = _parse_json_safe(raw)
    assert result["caption"] == "glass tower"
    assert "parse_error" not in result


def test_parse_json_safe_think_then_fences():
    payload = {"caption": "timber structure", "tags": ["vernacular"]}
    raw = f"<think>reasoning</think>\n```json\n{json.dumps(payload)}\n```"
    result = _parse_json_safe(raw)
    assert result["caption"] == "timber structure"


# ---------------------------------------------------------------------------
# _normalize_result
# ---------------------------------------------------------------------------

def test_normalize_result_dedupes_and_lowercases():
    result = {
        "architectural_style": ["Modern", "modern", "Brutalist"],
        "materials": ["raw concrete", "Glass Curtain Wall"],
        "structure": [],
        "composition": [],
        "spatial_features": [],
        "lighting": [],
        "program_hints": [],
        "tags": [],
    }
    out = _normalize_result(result)
    assert out["architectural_style"] == ["modernist", "brutalist"]
    assert "exposed concrete" in out["materials"]
    assert "glass curtain wall" in out["materials"]


def test_normalize_result_non_list_field_becomes_empty():
    result = {
        "architectural_style": "brutalist",  # wrong type
        "materials": [],
        "structure": [],
        "composition": [],
        "spatial_features": [],
        "lighting": [],
        "program_hints": [],
        "tags": [],
    }
    out = _normalize_result(result)
    assert out["architectural_style"] == []


# ---------------------------------------------------------------------------
# caption_image — mocked Ollama client
# ---------------------------------------------------------------------------

_MOCK_VLM_OUTPUT = {
    "view_type": "facade",
    "architectural_style": ["brutalist"],
    "materials": ["exposed concrete"],
    "structure": ["pilotis"],
    "composition": ["monolithic massing"],
    "spatial_features": ["courtyard"],
    "lighting": ["diffuse daylight"],
    "program_hints": ["civic"],
    "tags": ["brutalist", "exposed concrete", "pilotis"],
    "caption": "Brutalist civic building with exposed concrete and pilotis.",
    "embedding_text": "brutalist civic exposed concrete pilotis monolithic massing",
    "raw_visual_description": "Heavy concrete volume raised on pilotis.",
    "identity": {"building_name": None, "confidence": 0.0},
}


def _make_mock_response(content: str):
    msg = MagicMock()
    msg.content = content
    resp = MagicMock()
    resp.message = msg
    return resp


def test_caption_image_returns_caption_key(tmp_path):
    img = tmp_path / "test.jpg"
    # minimal valid JPEG header bytes
    img.write_bytes(
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xd9"
    )

    settings = SimpleNamespace(
        ollama_base_url="http://localhost:11434",
        ollama_api_key=None,
        ollama_vlm_model="qwen2-vl",
    )

    with patch("app.workers.captioner.Client") as MockClient:
        instance = MockClient.return_value
        instance.chat.return_value = _make_mock_response(
            json.dumps(_MOCK_VLM_OUTPUT)
        )

        result = caption_image(str(img), settings)

    assert result["caption"] == _MOCK_VLM_OUTPUT["caption"]
    assert result["tags"] == ["brutalist", "exposed concrete", "pilotis"]
    assert result["architectural_style"] == ["brutalist"]
    assert result["materials"] == ["exposed concrete"]
    assert result["method"] == "ollama/qwen2-vl"
    # key that was previously broken ("summary") must NOT be the caption key
    assert "summary" not in result


def test_caption_image_handles_none_content(tmp_path):
    img = tmp_path / "test.jpg"
    img.write_bytes(b"\xff\xd8\xff\xd9")

    settings = SimpleNamespace(
        ollama_base_url="http://localhost:11434",
        ollama_api_key=None,
        ollama_vlm_model="qwen2-vl",
    )

    with patch("app.workers.captioner.Client") as MockClient:
        instance = MockClient.return_value
        instance.chat.return_value = _make_mock_response(None)

        result = caption_image(str(img), settings)

    assert result.get("parse_error") is True
