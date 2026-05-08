"""Unified LLM client for Anthropic Claude and Ollama.

Configured via LLM_PROVIDER, ANTHROPIC_API_KEY, OLLAMA_BASE_URL, OLLAMA_MODEL.
All calls are synchronous (used inside async endpoints via run_in_executor or
directly from worker processes).
"""
from __future__ import annotations

import json
from typing import Any, Optional

import httpx
import structlog

logger = structlog.get_logger()


def complete(
    system: str,
    user: str,
    model_override: Optional[str] = None,
    temperature: float = 0.0,
    max_tokens: int = 512,
) -> str:
    """Return the assistant text completion."""
    from app.config import get_settings

    settings = get_settings()

    if settings.llm_provider == "anthropic":
        return _anthropic_complete(
            system=system,
            user=user,
            model=model_override or "claude-haiku-4-5",
            temperature=temperature,
            max_tokens=max_tokens,
            api_key=settings.anthropic_api_key,
        )
    else:
        return _ollama_complete(
            system=system,
            user=user,
            model=model_override or settings.ollama_model,
            temperature=temperature,
            base_url=settings.ollama_base_url,
        )


def complete_json(
    system: str,
    user: str,
    model_override: Optional[str] = None,
    temperature: float = 0.0,
) -> Any:
    """Return a parsed JSON object from the LLM."""
    raw = complete(system=system, user=user, model_override=model_override, temperature=temperature)
    # Strip markdown code fences that some models add
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return json.loads(raw)


def _anthropic_complete(
    system: str,
    user: str,
    model: str,
    temperature: float,
    max_tokens: int,
    api_key: str,
) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return message.content[0].text


def _ollama_complete(
    system: str,
    user: str,
    model: str,
    temperature: float,
    base_url: str,
) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {"temperature": temperature},
    }
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(f"{base_url.rstrip('/')}/api/chat", json=payload)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("ollama_error", error=str(exc))
        raise RuntimeError(f"Ollama request failed: {exc}") from exc

    return resp.json()["message"]["content"]
