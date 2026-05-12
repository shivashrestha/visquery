"""Re-embed all DB images and rebuild FAISS index.

Run once on cloud to recover from missing FAISS vectors:
    docker exec visquery-worker-1 python /app/scripts/reindex_faiss.py
"""
from __future__ import annotations

import sys
import numpy as np
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.services.embedder import embed_image_from_path
from app.services.vector_store import get_clip_store
from app.workers.ingest_worker import _resolve_storage_path


def main() -> int:
    settings = get_settings()
    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)

    with Session() as db:
        from app.models.source import Image

        images = db.query(Image).all()
        total = len(images)
        print(f"Images in DB: {total}")
        print(f"FAISS size before: {clip_store.size}")

        ok = failed = skipped = 0
        for img in images:
            path = _resolve_storage_path(img.storage_path, settings)
            try:
                vec = embed_image_from_path(path)
                clip_store.add(vec[np.newaxis, :], [str(img.id)])
                if img.ingest_status == "processing":
                    img.ingest_status = "ready"
                ok += 1
                print(f"[{ok}/{total}] OK  {img.id}")
            except FileNotFoundError:
                skipped += 1
                print(f"[SKIP] {img.id} — file missing: {path}")
            except Exception as exc:
                failed += 1
                print(f"[FAIL] {img.id} — {exc}")

        db.commit()

    print(f"\nDone: {ok} indexed, {skipped} missing file, {failed} errors")
    print(f"FAISS size after: {clip_store.size}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
