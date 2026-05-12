"""Build CLIP FAISS index by scanning images directory.

Run inside worker container:
    python /app/scripts/build_faiss_from_images.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

IMAGES_DIR   = Path("/data/images")
VECTORS_DIR  = Path("/data/vectors")
CHECKPOINT   = Path("/data/checkpoints/best_clip_v2.pt")
INDEX_PATH   = VECTORS_DIR / "clip_v2.index"
ID_MAP_PATH  = VECTORS_DIR / "clip_v2.id_map.json"
IMAGE_EXTS   = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def load_clip():
    import open_clip
    import torch

    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai"
    )
    if CHECKPOINT.exists():
        state = torch.load(CHECKPOINT, map_location="cpu", weights_only=False)
        state_dict = state.get("model_state_dict", state.get("model", state))
        model.load_state_dict(state_dict, strict=False)
        print(f"Loaded finetuned weights: {CHECKPOINT}")
    else:
        print(f"Checkpoint not found at {CHECKPOINT} — using base weights")

    model.eval()
    return model, preprocess, torch


def embed_image(path: Path, model, preprocess, torch) -> np.ndarray:
    from PIL import Image

    img = Image.open(path).convert("RGB")
    tensor = preprocess(img).unsqueeze(0)
    with torch.no_grad():
        feat = model.encode_image(tensor)
        feat /= feat.norm(dim=-1, keepdim=True)
    return feat[0].numpy().astype(np.float32)


def main() -> None:
    VECTORS_DIR.mkdir(parents=True, exist_ok=True)

    image_files = sorted(
        p for p in IMAGES_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )
    total = len(image_files)
    print(f"Images dir : {IMAGES_DIR}")
    print(f"Vectors dir: {VECTORS_DIR}")
    print(f"Found {total} images")

    if total == 0:
        print("No images found. Exiting.")
        return

    print("Loading CLIP ViT-B/32 ...")
    model, preprocess, torch = load_clip()
    print("Model ready.\n")

    import faiss

    index = faiss.IndexFlatIP(512)
    id_map: list[str] = []
    ok = failed = 0

    for i, path in enumerate(image_files, 1):
        image_id = path.stem
        try:
            vec = embed_image(path, model, preprocess, torch)
            index.add(vec[np.newaxis, :])
            id_map.append(image_id)
            ok += 1
            print(f"[{i}/{total}] OK   {image_id}")
        except Exception as exc:
            failed += 1
            print(f"[{i}/{total}] FAIL {path.name} — {exc}")

    faiss.write_index(index, str(INDEX_PATH))
    ID_MAP_PATH.write_text(json.dumps(id_map))

    print(f"\nDone: {ok} indexed, {failed} failed")
    print(f"FAISS vectors: {index.ntotal}")
    print(f"Index  : {INDEX_PATH}")
    print(f"ID map : {ID_MAP_PATH}")


if __name__ == "__main__":
    main()
