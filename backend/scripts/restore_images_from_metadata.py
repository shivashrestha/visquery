"""Restore `images` DB rows from {storage_root}/metadata/*.json sidecar files.

Recovers from accidental row deletion: image files, metadata JSONs, and the
CLIP FAISS index survive on disk — only the Postgres rows are rebuilt here.
Idempotent: existing ids and sha256 duplicates are skipped.

Run inside the backend/worker container:
    python /app/scripts/restore_images_from_metadata.py [--dry-run]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from app.config import get_settings

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".gif")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _dimensions(path: Path) -> tuple[int | None, int | None]:
    try:
        from PIL import Image
        with Image.open(path) as img:
            return img.size
    except Exception:
        return None, None


def _find_image_file(images_dir: Path, image_id: str, meta: dict) -> Path | None:
    stored = meta.get("stored_filename")
    if stored and (images_dir / stored).exists():
        return images_dir / stored
    for ext in IMAGE_EXTS:
        p = images_dir / f"{image_id}{ext}"
        if p.exists():
            return p
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore images rows from metadata JSONs")
    parser.add_argument("--dry-run", action="store_true", help="report only, no writes")
    args = parser.parse_args()

    settings = get_settings()
    storage_root = Path(settings.storage_root)
    metadata_dir = storage_root / "metadata"
    images_dir = storage_root / "images"

    meta_files = sorted(metadata_dir.glob("*.json"))
    print(f"Metadata files: {len(meta_files)} in {metadata_dir}")

    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    restored = skipped = failed = 0
    with Session() as db:
        for mf in meta_files:
            image_id = mf.stem
            try:
                uuid.UUID(image_id)
            except ValueError:
                print(f"SKIP {mf.name} — filename is not a UUID")
                skipped += 1
                continue

            try:
                meta = json.loads(mf.read_text(encoding="utf-8"))
            except Exception as exc:
                print(f"FAIL {mf.name} — unreadable JSON: {exc}")
                failed += 1
                continue

            exists = db.execute(
                sa.text("SELECT 1 FROM images WHERE id = :id"), {"id": image_id}
            ).first()
            if exists:
                skipped += 1
                continue

            img_path = _find_image_file(images_dir, image_id, meta)
            if img_path is None:
                print(f"SKIP {image_id} — no image file on disk")
                skipped += 1
                continue

            sha256 = _sha256(img_path)
            dupe = db.execute(
                sa.text("SELECT id FROM images WHERE sha256 = :h"), {"h": sha256}
            ).first()
            if dupe:
                print(f"SKIP {image_id} — sha256 already present as {dupe[0]}")
                skipped += 1
                continue

            width, height = _dimensions(img_path)
            title = meta.get("title") or ""
            description = meta.get("description") or ""
            building_type = meta.get("building_type") or ""
            style = meta.get("architecture_style_classified") or ""
            artifacts = meta.get("artifacts") or None
            if not style and isinstance(artifacts, dict):
                style = (artifacts.get("style") or {}).get("primary", "") or ""
            materials = (artifacts or {}).get("materials") or []
            orig_filename = meta.get("filename") or img_path.name

            if args.dry_run:
                print(f"WOULD RESTORE {image_id} — {title[:60]}")
                restored += 1
                continue

            try:
                db.execute(
                    sa.text("""
                        INSERT INTO images (
                            id, storage_path, sha256, width, height,
                            caption, caption_method, license,
                            embedding_version, metadata_json, artifacts_json, tags,
                            ingest_status, metadata_ready,
                            name, materials, description,
                            source_url, source_title, source_spider
                        ) VALUES (
                            :id, :storage_path, :sha256, :width, :height,
                            :caption, 'restored', 'unknown',
                            :embedding_version, CAST(:metadata_json AS jsonb),
                            CAST(:artifacts_json AS jsonb), :tags,
                            'ready', true,
                            :name, :materials, :description,
                            :source_url, :source_title, 'metadata_restore'
                        )
                    """),
                    {
                        "id": image_id,
                        "storage_path": str(img_path),
                        "sha256": sha256,
                        "width": width,
                        "height": height,
                        "caption": title,
                        "embedding_version": settings.embedding_version,
                        "metadata_json": json.dumps({
                            "title": title,
                            "description": description,
                            "building_type": building_type,
                            "architecture_style_classified": style,
                        }, ensure_ascii=False, default=str),
                        "artifacts_json": json.dumps(artifacts, ensure_ascii=False, default=str) if artifacts else None,
                        "tags": [style] if style else [],
                        "name": title or Path(orig_filename).stem,
                        "materials": materials,
                        "description": description,
                        "source_url": f"local://{orig_filename}",
                        "source_title": title or Path(orig_filename).stem,
                    },
                )
                db.commit()
                restored += 1
                print(f"RESTORED {image_id} — {title[:60]}")
            except Exception as exc:
                db.rollback()
                failed += 1
                print(f"FAIL {image_id} — {exc}")

    print(f"\nDone: restored={restored} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
