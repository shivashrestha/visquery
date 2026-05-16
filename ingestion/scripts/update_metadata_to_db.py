#!/usr/bin/env python3
"""
update_metadata_to_db.py

Reads processed metadata from storage/metadata/ and inserts rows into the
images table, mirroring the ingest_worker.py data model.

Run from repo root or any directory — paths are resolved relative to this file.

Requirements:
    pip install psycopg2-binary pillow

Postgres is mapped to host port 15432 in docker-compose.

Env vars:
    DATABASE_URL        full DSN (overrides all below)
    POSTGRES_PASSWORD   required if DATABASE_URL not set
    POSTGRES_HOST       default: localhost
    POSTGRES_PORT       default: 15432
    POSTGRES_USER       default: visquery
    POSTGRES_DB         default: visquery

NOTE: CLIP/FAISS vectors are NOT written by this script (VLM pipeline unavailable).
      Image-similarity search will not work until embeddings are generated.
      Text/metadata search works immediately after this script runs.
"""

import hashlib
import json
import os
import sys
import uuid
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import Json, register_uuid
except ImportError:
    print("ERROR: pip install psycopg2-binary")
    sys.exit(1)

try:
    from PIL import Image as PILImage
except ImportError:
    print("ERROR: pip install pillow")
    sys.exit(1)

# --- Paths ---
SCRIPT_DIR   = Path(__file__).resolve().parent
REPO_ROOT    = SCRIPT_DIR.parent.parent
METADATA_DIR = REPO_ROOT / "storage" / "metadata"
IMAGES_DIR   = REPO_ROOT / "storage" / "images"

# Path as seen from inside Docker containers (storage/ → /data)
DOCKER_IMAGES_PREFIX = "/data/images"


# --- Load .env from repo root (won't override already-set env vars) ---
_env_file = REPO_ROOT / ".env"
if _env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_file, override=False)
    except ImportError:
        # Manual fallback: parse KEY=VALUE lines
        for line in _env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            if k not in os.environ:
                os.environ[k] = v.strip().strip('"').strip("'")


# --- DB connection ---
# DATABASE_URL in .env uses Docker-internal hostname (postgres:5432).
# When running from host, use localhost + the mapped port 15432 instead.
def _build_dsn() -> str:
    pg_pass = os.environ.get("POSTGRES_PASSWORD", "")
    if not pg_pass:
        print("ERROR: set POSTGRES_PASSWORD in .env or environment")
        sys.exit(1)
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "15432")
    user = os.environ.get("POSTGRES_USER", "visquery")
    db   = os.environ.get("POSTGRES_DB",   "visquery")
    return f"postgresql://{user}:{pg_pass}@{host}:{port}/{db}"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _dimensions(path: Path):
    try:
        with PILImage.open(path) as img:
            return img.size  # (width, height)
    except Exception:
        return None, None


INSERT_SQL = """
INSERT INTO images (
    id, storage_path, sha256, width, height,
    caption, caption_method,
    license, source_spider,
    embedding_version,
    name, materials, description,
    metadata_json, artifacts_json, tags,
    ingest_status, metadata_ready
) VALUES (
    %(id)s, %(storage_path)s, %(sha256)s, %(width)s, %(height)s,
    %(caption)s, %(caption_method)s,
    %(license)s, %(source_spider)s,
    %(embedding_version)s,
    %(name)s, %(materials)s, %(description)s,
    %(metadata_json)s, %(artifacts_json)s, %(tags)s,
    %(ingest_status)s, %(metadata_ready)s
)
ON CONFLICT (sha256) DO NOTHING
"""


def process():
    if not METADATA_DIR.exists():
        print(f"ERROR: metadata dir not found: {METADATA_DIR}")
        sys.exit(1)
    if not IMAGES_DIR.exists():
        print(f"ERROR: images dir not found: {IMAGES_DIR}")
        sys.exit(1)

    jsons = sorted(METADATA_DIR.glob("*.json"))
    print(f"Found {len(jsons)} metadata files")
    print(f"  metadata : {METADATA_DIR}")
    print(f"  images   : {IMAGES_DIR}")
    print()

    conn = psycopg2.connect(_build_dsn())
    register_uuid()
    cur  = conn.cursor()

    inserted = skipped = errors = 0

    for meta_path in jsons:
        image_id_str = meta_path.stem

        try:
            uid = uuid.UUID(image_id_str)
        except ValueError:
            print(f"  [SKIP] non-UUID filename: {meta_path.name}")
            continue

        image_file = IMAGES_DIR / f"{image_id_str}.jpg"
        if not image_file.exists():
            print(f"  [WARN] image missing for {image_id_str} — skip")
            skipped += 1
            continue

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  [ERROR] parse {meta_path.name}: {e}")
            errors += 1
            continue

        try:
            sha256 = _sha256(image_file)

            # skip duplicate
            cur.execute("SELECT id FROM images WHERE sha256 = %s", (sha256,))
            if cur.fetchone():
                print(f"  [DUP]  {image_id_str}")
                skipped += 1
                continue

            artifacts     = meta.get("artifacts") or {}
            title         = meta.get("title", "")
            description   = meta.get("description", "") or artifacts.get("description", "")
            building_type = meta.get("building_type", "") or artifacts.get("building_type", "")
            style = (
                meta.get("architecture_style_classified", "")
                or artifacts.get("architecture_style_classified", "")
                or (artifacts.get("style") or {}).get("primary", "")
            )
            materials = artifacts.get("materials") or []
            tags      = [style] if style else []

            width, height = _dimensions(image_file)

            cur.execute(INSERT_SQL, {
                "id":               uid,
                "storage_path":     f"{DOCKER_IMAGES_PREFIX}/{image_id_str}.jpg",
                "sha256":           sha256,
                "width":            width,
                "height":           height,
                "caption":          title or None,
                "caption_method":   "manual_import",
                "license":          "unknown",
                "source_spider":    "manual_import",
                "embedding_version": "2",
                "name":             title or None,
                "materials":        materials,
                "description":      description or None,
                "metadata_json":    Json({
                    "title": title,
                    "description": description,
                    "building_type": building_type,
                    "architecture_style_classified": style,
                }),
                "artifacts_json":   Json(artifacts) if artifacts else None,
                "tags":             tags,
                "ingest_status":    "ready",
                "metadata_ready":   True,
            })
            conn.commit()
            inserted += 1
            print(f"  [OK]   {image_id_str} — {(title or '(no title)')[:60]}")

        except Exception as e:
            conn.rollback()
            print(f"  [ERROR] {image_id_str}: {e}")
            errors += 1

    cur.close()
    conn.close()
    print(f"\nDone.  inserted={inserted}  skipped={skipped}  errors={errors}")


if __name__ == "__main__":
    process()
