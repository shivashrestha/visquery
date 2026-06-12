"""Backfill image_segments for the existing corpus.

Batched and resumable:
  - images that already have segment rows are skipped (DB check, also
    enforced inside index_image_segments)
  - images that yielded zero segments are remembered in a progress file
    so re-runs don't re-segment them

Run inside the backend/worker container:
    python /app/scripts/backfill_segments.py [--batch 25] [--limit 0] [--status ready]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sqlalchemy as sa

from app.config import get_settings
from app.workers.segment_indexer import index_image_segments


def _progress_path(settings) -> Path:
    return Path(settings.storage_root) / "segments" / ".backfill_done.json"


def _load_done(path: Path) -> set[str]:
    try:
        return set(json.loads(path.read_text()))
    except Exception:
        return set()


def _save_done(path: Path, done: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(done)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill image_segments index")
    parser.add_argument("--batch", type=int, default=25, help="images per DB fetch")
    parser.add_argument("--limit", type=int, default=0, help="max images to process (0 = all)")
    parser.add_argument("--status", default="ready", help="ingest_status filter")
    args = parser.parse_args()

    settings = get_settings()
    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)

    progress_file = _progress_path(settings)
    done = _load_done(progress_file)
    print(f"Progress file: {progress_file} ({len(done)} previously completed)")

    processed = ok = empty = failed = skipped = 0
    t0 = time.time()

    while True:
        if args.limit and processed >= args.limit:
            break
        with engine.connect() as conn:
            rows = conn.execute(
                sa.text("""
                    SELECT i.id FROM images i
                    LEFT JOIN image_segments s ON s.image_id = i.id
                    WHERE s.id IS NULL
                      AND i.ingest_status = :status
                      AND NOT (i.id::text = ANY(:done))
                    ORDER BY i.created_at, i.id
                    LIMIT :batch
                """),
                {"status": args.status, "done": list(done) or [""], "batch": args.batch},
            ).fetchall()
        if not rows:
            break

        for (image_id,) in rows:
            if args.limit and processed >= args.limit:
                break
            image_id = str(image_id)
            processed += 1
            try:
                result = index_image_segments(image_id)
            except Exception as exc:
                failed += 1
                print(f"[{processed}] {image_id} FAILED: {exc}", flush=True)
                done.add(image_id)  # don't retry crashers in this run; remove from file to retry
                continue
            status = result.get("status")
            n = result.get("segments", 0)
            if status == "ok" and n > 0:
                ok += 1
            elif status == "ok":
                empty += 1
                done.add(image_id)
            else:
                skipped += 1
                done.add(image_id)
            print(f"[{processed}] {image_id} {status} segments={n}", flush=True)
            if processed % 10 == 0:
                _save_done(progress_file, done)

        _save_done(progress_file, done)

    _save_done(progress_file, done)
    elapsed = time.time() - t0
    print(
        f"\nDone in {elapsed:.0f}s — processed={processed} indexed={ok} "
        f"empty={empty} skipped={skipped} failed={failed}"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
