"""Ollama LLM client using ollama Python library.

Configured via OLLAMA_BASE_URL, RAG_LLM_MODEL (or OLLAMA_MODEL), and OLLAMA_API_KEY.
All calls are synchronous (used inside async endpoints via run_in_executor or
directly from worker processes).
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

_RETRY_DELAYS = [2, 5, 10]  # seconds between retries on 429


def complete(
    system: str,
    user: str,
    model_override: Optional[str] = None,
    temperature: float = 0.0,
    max_tokens: int = 512,
) -> str:
    """Return the assistant text completion. Retries on 429 with backoff."""
    from ollama import Client
    from app.config import get_settings

    settings = get_settings()
    model = model_override or settings.rag_llm_model or settings.ollama_model

    headers = {}
    if settings.ollama_api_key:
        headers["Authorization"] = f"Bearer {settings.ollama_api_key}"

    client = Client(host=settings.ollama_base_url, headers=headers)
    last_exc: Exception | None = None

    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            time.sleep(delay)
        try:
            response = client.chat(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                options={"temperature": temperature, "num_predict": max_tokens},
            )
            return response["message"]["content"]
        except Exception as exc:
            last_exc = exc
            if "429" in str(exc) or "too many concurrent" in str(exc).lower():
                logger.warning("ollama_rate_limited", model=model, attempt=attempt, retry_in=_RETRY_DELAYS[attempt] if attempt < len(_RETRY_DELAYS) else 0)
                continue
            logger.error("ollama_error", model=model, error=str(exc))
            raise RuntimeError(f"Ollama request failed: {exc}") from exc

    logger.error("ollama_error", model=model, error=str(last_exc))
    raise RuntimeError(f"Ollama request failed after retries: {last_exc}") from last_exc


def complete_json(
    system: str,
    user: str,
    model_override: Optional[str] = None,
    temperature: float = 0.0,
) -> Any:
    """Return a parsed JSON object from the LLM."""
    raw = complete(system=system, user=user, model_override=model_override, temperature=temperature)
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return json.loads(raw)
