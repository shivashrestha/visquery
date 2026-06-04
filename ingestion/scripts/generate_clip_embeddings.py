#!/usr/bin/env python3
"""
generate_clip_embeddings.py

Embeds all images in the DB that are missing CLIP vectors.
Reads images from storage, embeds with ViT-B/32 open_clip, adds to FAISS.

Run inside the container:
    docker exec visquery-fastapi-1 python /scripts/generate_clip_embeddings.py

Or locally with correct env vars set.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, "/app")

# ── deps ──────────────────────────────────────────────────
try:
    import faiss  # noqa: F401
except ImportError:
    print("ERROR: faiss-cpu not installed")
    sys.exit(1)

try:
    import open_clip  # noqa: F401
except ImportError:
    print("ERROR: open_clip not installed")
    sys.exit(1)

import numpy as np
from PIL import Image as PILImage
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# ── config ────────────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://visquery:visquery@localhost:15432/visquery",
)
STORAGE_ROOT = Path(os.environ.get("STORAGE_ROOT", "/data"))
FAISS_DATA_DIR = Path(os.environ.get("FAISS_DATA_DIR", "/data/vectors"))
EMBEDDING_VERSION = os.environ.get("EMBEDDING_VERSION", "2")
CLIP_CHECKPOINT = os.environ.get("CLIP_CHECKPOINT_PATH", "")


def load_clip():
    import torch
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai"
    )
    if CLIP_CHECKPOINT and Path(CLIP_CHECKPOINT).exists():
        state = torch.load(CLIP_CHECKPOINT, map_location="cpu", weights_only=False)
        sd = state.get("model_state_dict", state.get("model", state))
        model.load_state_dict(sd, strict=False)
        print(f"Loaded fine-tuned checkpoint: {CLIP_CHECKPOINT}")
    model.eval()
    return model, preprocess


def embed_pil(model, preprocess, pil_img) -> np.ndarray:
    import torch
    t = preprocess(pil_img).unsqueeze(0)
    with torch.no_grad():
        f = model.encode_image(t)
        f /= f.norm(dim=-1, keepdim=True)
    return f[0].numpy().astype(np.float32)


def resolve_path(storage_path: str) -> Path | None:
    p = Path(storage_path)
    if p.exists():
        return p
    # Try relative to STORAGE_ROOT
    parts = p.parts
    for i, part in enumerate(parts):
        if part in ("images", "metadata"):
            candidate = STORAGE_ROOT / Path(*parts[i:])
            if candidate.exists():
                return candidate
    return None


def main():
    import json
    from app.models.source import Image  # type: ignore

    engine = create_engine(DATABASE_URL)

    # Load CLIP
    print("Loading CLIP model...")
    model, preprocess = load_clip()
    print("CLIP ready.")

    # Load existing CLIP FAISS index
    index_path = FAISS_DATA_DIR / f"clip_v{EMBEDDING_VERSION}.index"
    id_map_path = FAISS_DATA_DIR / f"clip_v{EMBEDDING_VERSION}.id_map.json"
    FAISS_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if index_path.exists():
        index = faiss.read_index(str(index_path))
        id_map: list[str] = json.loads(id_map_path.read_text())
        print(f"Loaded existing CLIP index: {index.ntotal} vectors")
    else:
        index = faiss.IndexFlatIP(512)
        id_map = []
        print("Created new empty CLIP index")

    existing_ids = set(id_map)

    with Session(engine) as db:
        images = db.query(Image).all()
        total = len(images)
        print(f"DB images: {total}  |  Already in CLIP: {len(existing_ids)}")

        added = 0
        skipped = 0
        failed = 0

        for img in images:
            iid = str(img.id)
            if iid in existing_ids:
                skipped += 1
                continue

            p = resolve_path(img.storage_path)
            if p is None:
                print(f"  MISSING file for {iid}: {img.storage_path}")
                failed += 1
                continue

            try:
                pil = PILImage.open(p).convert("RGB")
                vec = embed_pil(model, preprocess, pil)
                index.add(vec[np.newaxis, :])
                id_map.append(iid)
                existing_ids.add(iid)
                added += 1
                print(f"  [{added + skipped}/{total - failed}] Embedded {iid}")
            except Exception as exc:
                print(f"  ERROR embedding {iid}: {exc}")
                failed += 1

        # Persist
        faiss.write_index(index, str(index_path))
        id_map_path.write_text(json.dumps(id_map))
        print(f"\nDone. added={added} skipped={skipped} failed={failed}")
        print(f"CLIP index now has {index.ntotal} vectors")


if __name__ == "__main__":
    main()
