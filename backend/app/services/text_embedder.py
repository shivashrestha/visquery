"""BGE-small-en-v1.5 text embedder for semantic metadata search.

Lazy-loads the model on first call. Runs in a dedicated ThreadPoolExecutor
so async routes can await embedding without blocking the event loop.
"""
from __future__ import annotations

import concurrent.futures

import numpy as np

_HF_MODEL_NAME = "BAAI/bge-small-en-v1.5"
# BGE asymmetric retrieval: prefix queries, NOT documents
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

_model = None
TEXT_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="text_embed"
)


def _resolve_model_path() -> str:
    """Return local checkpoint path if available, else HuggingFace model id."""
    import os
    from pathlib import Path

    # Allow override via env (set in docker-compose)
    override = os.environ.get("TEXT_EMBEDDING_MODEL", "").strip()
    if override:
        return override

    # Auto-detect local checkpoint next to other checkpoints
    candidates = [
        Path("/data/checkpoints/bge-small-en-v1.5"),           # Docker
        Path(__file__).resolve().parents[4]                      # repo root
        / "storage/data/checkpoints/bge-small-en-v1.5",
    ]
    for p in candidates:
        if p.exists():
            return str(p)

    return _HF_MODEL_NAME


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(_resolve_model_path())
    return _model


def embed_text_query(text: str) -> np.ndarray:
    """Return L2-normalised float32 (384,) embedding for a search query."""
    model = _get_model()
    vec = model.encode(
        [_QUERY_PREFIX + text],
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return vec[0].astype(np.float32)
