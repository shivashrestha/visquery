"""Cross-encoder reranker using BAAI/bge-reranker-base.

Takes a text query and a list of (image_id, caption) pairs and returns
relevance scores. CPU inference. Singleton, lazily loaded.

The cross-encoder scores query-caption pairs jointly, capturing interaction
effects that the bi-encoder CLIP cannot. This is the main quality lift for
concept queries.
"""
from __future__ import annotations

import threading
from typing import NamedTuple

import numpy as np
import structlog

logger = structlog.get_logger()

_lock = threading.Lock()
_tokenizer = None
_model = None


def _load(model_name: str) -> None:
    global _tokenizer, _model

    with _lock:
        if _model is not None:
            return

        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        logger.info("reranker_loading", model=model_name)
        _tokenizer = AutoTokenizer.from_pretrained(model_name)
        _model = AutoModelForSequenceClassification.from_pretrained(model_name)
        _model.eval()
        logger.info("reranker_ready", model=model_name)


class RerankerCandidate(NamedTuple):
    image_id: str
    caption: str
    original_score: float


def rerank(
    query: str,
    candidates: list[RerankerCandidate],
    model_name: str = "BAAI/bge-reranker-base",
    batch_size: int = 32,
) -> list[tuple[str, float]]:
    """Return (image_id, reranker_score) pairs sorted descending by score."""
    if not candidates:
        return []

    _load(model_name)

    import torch

    pairs = [(query, c.caption) for c in candidates]
    all_scores: list[float] = []

    for i in range(0, len(pairs), batch_size):
        batch = pairs[i : i + batch_size]
        encoded = _tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )
        with torch.no_grad():
            logits = _model(**encoded).logits.squeeze(-1)
            scores = torch.sigmoid(logits).tolist()
            if isinstance(scores, float):
                scores = [scores]
        all_scores.extend(scores)

    ranked = sorted(
        zip([c.image_id for c in candidates], all_scores),
        key=lambda x: x[1],
        reverse=True,
    )
    return ranked
