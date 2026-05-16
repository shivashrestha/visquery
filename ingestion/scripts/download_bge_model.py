#!/usr/bin/env python3
"""
One-time download: saves BAAI/bge-small-en-v1.5 to
storage/data/checkpoints/bge-small-en-v1.5/

Run from repo root (host machine, internet required):
    python ingestion/scripts/download_bge_model.py

Docker mounts ./storage/data/checkpoints → /data/checkpoints (read-only),
so the model is available inside containers without HuggingFace network access.
"""
from pathlib import Path

from sentence_transformers import SentenceTransformer

DEST = Path(__file__).resolve().parents[2] / "storage" / "data" / "checkpoints" / "bge-small-en-v1.5"

print(f"Downloading BAAI/bge-small-en-v1.5 → {DEST}")
model = SentenceTransformer("BAAI/bge-small-en-v1.5")
model.save(str(DEST))
print("Done.")
