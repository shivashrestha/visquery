"""FAISS index manager.

Two indexes live on disk:
  {faiss_data_dir}/clip_v{version}.index   — CLIP visual-semantic embeddings
  {faiss_data_dir}/style_v{version}.index  — Gram-matrix style features

Each index has a sidecar {name}.id_map.json mapping FAISS integer positions to
image UUIDs. This file is loaded into memory at startup and kept in sync on
every add operation.

Both indexes use IndexFlatIP (inner product) on L2-normalized vectors, which is
equivalent to cosine similarity and gives exact, deterministic results.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional

import numpy as np
import structlog

logger = structlog.get_logger()

_lock = threading.Lock()
_instances: dict[str, "VectorStore"] = {}


class VectorStore:
    def __init__(self, index_path: Path, id_map_path: Path, dim: int) -> None:
        import faiss

        self._index_path = index_path
        self._id_map_path = id_map_path
        self._dim = dim
        self._lock = threading.Lock()

        if index_path.exists():
            self._index = faiss.read_index(str(index_path))
            logger.info("faiss_index_loaded", path=str(index_path), ntotal=self._index.ntotal)
        else:
            self._index = faiss.IndexFlatIP(dim)
            logger.info("faiss_index_created_empty", path=str(index_path), dim=dim)

        if id_map_path.exists():
            self._id_map: list[str] = json.loads(id_map_path.read_text())
        else:
            self._id_map = []

        # Sanity check — these must match after loading.
        if len(self._id_map) != self._index.ntotal:
            logger.warning(
                "faiss_id_map_mismatch",
                id_map_len=len(self._id_map),
                index_ntotal=self._index.ntotal,
            )

    def add(self, vectors: np.ndarray, image_ids: list[str]) -> None:
        """Add (N, dim) float32 vectors with their image UUID strings."""
        import faiss

        assert vectors.ndim == 2 and vectors.shape[1] == self._dim
        with self._lock:
            self._index.add(vectors.astype(np.float32))
            self._id_map.extend(image_ids)
            self._persist()

    def search(self, query: np.ndarray, k: int) -> tuple[list[str], list[float]]:
        """Return (image_ids, scores) for the top-k nearest neighbors."""
        if query.ndim == 1:
            query = query[np.newaxis, :]
        query = query.astype(np.float32)

        with self._lock:
            if self._index.ntotal == 0:
                return [], []
            k = min(k, self._index.ntotal)
            scores, indices = self._index.search(query, k)

        image_ids = [self._id_map[i] for i in indices[0] if i != -1]
        valid_scores = [float(s) for s, i in zip(scores[0], indices[0]) if i != -1]
        return image_ids, valid_scores

    def _persist(self) -> None:
        import faiss

        self._index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self._index, str(self._index_path))
        self._id_map_path.write_text(json.dumps(self._id_map))

    @property
    def size(self) -> int:
        return self._index.ntotal


def _get_store(name: str, version: str, dim: int, data_dir: str) -> VectorStore:
    """Return a cached VectorStore instance, loading from disk if needed."""
    key = f"{name}_{version}"
    with _lock:
        if key not in _instances:
            base = Path(data_dir)
            index_path = base / f"{name}_v{version}.index"
            id_map_path = base / f"{name}_v{version}.id_map.json"
            _instances[key] = VectorStore(index_path, id_map_path, dim)
    return _instances[key]


def get_clip_store(version: str, data_dir: str) -> VectorStore:
    return _get_store("clip", version, dim=512, data_dir=data_dir)


def get_style_store(version: str, data_dir: str) -> VectorStore:
    # Gram vector dimension depends on the VGG-16 layer selection.
    # Empirically this is 2048 for the 4-layer configuration in style.py.
    return _get_store("style", version, dim=2048, data_dir=data_dir)
