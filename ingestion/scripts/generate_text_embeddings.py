#!/usr/bin/env python3
"""
generate_text_embeddings.py

Embeds architectural metadata from storage/metadata/ using bge-small-en-v1.5
and stores a FAISS index for fast semantic search.

Supports:
  - Text → images  : embed a text query, find closest images
  - Image → images : use a stored image's own embedding to find visually similar ones

Index files written to storage/vectors/text/:
  index.faiss   — FAISS IndexFlatIP (cosine via L2-normalised vectors)
  ids.json      — ordered list of image_ids matching FAISS row positions

Requirements:
    pip install sentence-transformers faiss-cpu numpy

Run:
    python ingestion/scripts/generate_text_embeddings.py
    python ingestion/scripts/generate_text_embeddings.py --search "glass curtain wall tower"
    python ingestion/scripts/generate_text_embeddings.py --similar <image_id>
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

try:
    import faiss
except ImportError:
    print("ERROR: pip install faiss-cpu")
    sys.exit(1)

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("ERROR: pip install sentence-transformers")
    sys.exit(1)

# --- Paths ---
SCRIPT_DIR   = Path(__file__).resolve().parent
REPO_ROOT    = SCRIPT_DIR.parent.parent
METADATA_DIR = REPO_ROOT / "storage" / "metadata"
INDEX_DIR    = REPO_ROOT / "storage" / "vectors" / "text"
INDEX_FILE   = INDEX_DIR / "index.faiss"
IDS_FILE     = INDEX_DIR / "ids.json"

MODEL_NAME = "BAAI/bge-small-en-v1.5"


# ---------------------------------------------------------------------------
# Metadata → text blob
# ---------------------------------------------------------------------------

def build_text(meta: dict) -> str:
    """Flatten all semantically useful metadata fields into one string."""
    a     = meta.get("artifacts") or {}
    style = a.get("style") or {}
    elems = a.get("architectural_elements") or {}
    spat  = a.get("spatial_features") or {}
    env   = a.get("environment") or {}
    mat_d = a.get("material_details") or {}

    parts = [
        meta.get("title", ""),
        meta.get("description", ""),
        meta.get("building_type", ""),
        meta.get("architecture_style_classified", ""),
        # style
        style.get("primary", ""),
        *style.get("secondary", []),
        *style.get("style_evidence", []),
        *style.get("emergent_tags", []),
        # materials
        *a.get("materials", []),
        *mat_d.get("textures", []),
        *mat_d.get("construction_expression", []),
        # elements
        *elems.get("structural", []),
        *elems.get("facade", []),
        *elems.get("roofing", []),
        *elems.get("openings", []),
        *elems.get("ornamental", []),
        # spatial + environment
        *spat.get("massing", []),
        *spat.get("geometry", []),
        *env.get("setting", []),
        *env.get("urban_context", []),
        # retrieval-optimised tags (highest weight — put last so TF skews toward them)
        *a.get("semantic_keywords", []),
        *a.get("retrieval_tags", []),
        *a.get("retrieval_tags", []),   # duplicate once to boost weight
    ]
    return " ".join(str(p).replace("_", " ") for p in parts if p)


# ---------------------------------------------------------------------------
# Build / save / load index
# ---------------------------------------------------------------------------

def _load_model() -> SentenceTransformer:
    print(f"Loading model: {MODEL_NAME}")
    # BGE models need a query prefix for retrieval tasks
    return SentenceTransformer(MODEL_NAME)


def _embed(model: SentenceTransformer, texts: list[str], is_query: bool = False) -> np.ndarray:
    """Return L2-normalised float32 embeddings."""
    prefix = "Represent this sentence for searching relevant passages: " if is_query else ""
    inputs = [prefix + t for t in texts] if is_query else texts
    vecs = model.encode(
        inputs,
        batch_size=32,
        show_progress_bar=True,
        normalize_embeddings=True,   # L2-norm → cosine via dot product
        convert_to_numpy=True,
    )
    return vecs.astype("float32")


def generate():
    """Read all metadata JSONs, embed, write FAISS index + id map."""
    if not METADATA_DIR.exists():
        print(f"ERROR: metadata dir not found: {METADATA_DIR}")
        sys.exit(1)

    jsons = sorted(METADATA_DIR.glob("*.json"))
    print(f"Found {len(jsons)} metadata files")

    ids, texts = [], []
    for p in jsons:
        try:
            meta = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  [SKIP] {p.name}: {e}")
            continue
        text = build_text(meta)
        if not text.strip():
            print(f"  [SKIP] {p.stem}: empty text")
            continue
        ids.append(p.stem)      # image_id (UUID)
        texts.append(text)

    if not ids:
        print("No valid metadata found.")
        return

    model = _load_model()
    print(f"Embedding {len(texts)} documents …")
    vecs = _embed(model, texts, is_query=False)

    # FAISS IndexFlatIP → exact cosine (vecs are L2-normalised)
    dim   = vecs.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(vecs)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_FILE))
    IDS_FILE.write_text(json.dumps(ids, ensure_ascii=False), encoding="utf-8")

    print(f"\nIndex written:")
    print(f"  {INDEX_FILE}  ({index.ntotal} vectors, dim={dim})")
    print(f"  {IDS_FILE}")


# ---------------------------------------------------------------------------
# Search helpers
# ---------------------------------------------------------------------------

def _load_index():
    if not INDEX_FILE.exists() or not IDS_FILE.exists():
        print("ERROR: index not found — run without --search/--similar first")
        sys.exit(1)
    index = faiss.read_index(str(INDEX_FILE))
    ids   = json.loads(IDS_FILE.read_text(encoding="utf-8"))
    return index, ids


def search_by_text(query: str, top_k: int = 10) -> list[dict]:
    """Embed a text query and return the top-K closest image_ids with scores."""
    model = _load_model()
    index, ids = _load_index()

    vec = _embed(model, [query], is_query=True)
    scores, positions = index.search(vec, min(top_k, index.ntotal))

    results = []
    for score, pos in zip(scores[0], positions[0]):
        if pos == -1:
            continue
        results.append({"image_id": ids[pos], "score": float(score)})
    return results


def search_by_image_id(image_id: str, top_k: int = 10) -> list[dict]:
    """
    Find images similar to a given image_id using its stored text embedding.
    The query image itself is excluded from results.
    """
    index, ids = _load_index()

    if image_id not in ids:
        print(f"ERROR: image_id {image_id} not in index")
        sys.exit(1)

    pos = ids.index(image_id)
    # reconstruct vector from index
    vec = np.zeros((1, index.d), dtype="float32")
    index.reconstruct(pos, vec[0])

    scores, positions = index.search(vec, min(top_k + 1, index.ntotal))

    results = []
    for score, p in zip(scores[0], positions[0]):
        if p == -1 or ids[p] == image_id:   # exclude self
            continue
        results.append({"image_id": ids[p], "score": float(score)})
        if len(results) >= top_k:
            break
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _print_results(results: list[dict]):
    meta_cache = {}
    for r in results:
        meta_file = METADATA_DIR / f"{r['image_id']}.json"
        title = ""
        if meta_file.exists():
            try:
                m = json.loads(meta_file.read_text(encoding="utf-8"))
                title = m.get("title", "")
                meta_cache[r["image_id"]] = m
            except Exception:
                pass
        print(f"  [{r['score']:.4f}] {r['image_id']}  {title[:70]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--search",  metavar="QUERY",    help="text query")
    parser.add_argument("--similar", metavar="IMAGE_ID", help="find similar images by image_id")
    parser.add_argument("--top-k",   type=int, default=10)
    args = parser.parse_args()

    if args.search:
        print(f"Searching: '{args.search}'")
        results = search_by_text(args.search, top_k=args.top_k)
        _print_results(results)

    elif args.similar:
        print(f"Similar to: {args.similar}")
        results = search_by_image_id(args.similar, top_k=args.top_k)
        _print_results(results)

    else:
        # default: generate the index
        generate()
