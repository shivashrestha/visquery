"""Backfill automated tag validation over the existing corpus.

Batched and resumable — cursor on image id, persisted to a progress file
after every batch. Re-runs continue where the last run stopped; pass
--restart to validate from the beginning (also re-validates rows that
already have a tag_status).

Run inside the backend/worker container:
    python /app/scripts/backfill_tag_validation.py [--batch 25] [--limit 0] [--restart]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import sqlalchemy as sa

from app.config import get_settings
from app.workers.tag_validator import validate_image_tags


def _cursor_path(settings) -> Path:
    return Path(settings.storage_root) / ".tag_validation_cursor"


def _load_cursor(path: Path) -> str | None:
    try:
        value = path.read_text().strip()
        return value or None
    except Exception:
        return None


def _save_cursor(path: Path, image_id: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(image_id)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill tag validation")
    parser.add_argument("--batch", type=int, default=25, help="images per DB fetch")
    parser.add_argument("--limit", type=int, default=0, help="max images to process (0 = all)")
    parser.add_argument("--restart", action="store_true", help="ignore saved cursor, start over")
    args = parser.parse_args()

    settings = get_settings()
    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)

    cursor_file = _cursor_path(settings)
    cursor = None if args.restart else _load_cursor(cursor_file)
    if cursor:
        print(f"Resuming from cursor {cursor}")

    processed = 0
    results = {"verified": 0, "provisional": 0, "quarantined": 0, "skipped": 0, "error": 0}
    t0 = time.monotonic()

    while True:
        with engine.connect() as conn:
            query = """
                SELECT id FROM images
                WHERE ingest_status = 'ready'
                  AND artifacts_json IS NOT NULL
            """
            params: dict = {"batch": args.batch}
            if cursor:
                query += " AND id > :cursor"
                params["cursor"] = cursor
            query += " ORDER BY id LIMIT :batch"
            rows = conn.execute(sa.text(query), params).fetchall()

        if not rows:
            break

        for (image_id,) in rows:
            iid = str(image_id)
            try:
                out = validate_image_tags(iid)
                status = out.get("status", "error")
                results[status] = results.get(status, 0) + 1
            except Exception as exc:
                results["error"] += 1
                print(f"  ERROR {iid}: {exc}", file=sys.stderr)
            processed += 1
            cursor = iid
            if args.limit and processed >= args.limit:
                break

        _save_cursor(cursor_file, cursor)
        elapsed = time.monotonic() - t0
        print(f"[{processed}] cursor={cursor} ({processed / elapsed:.1f} img/s)")

        if args.limit and processed >= args.limit:
            break

    # Summary from DB — covers the whole corpus, not just this run
    with engine.connect() as conn:
        counts = dict(conn.execute(sa.text("""
            SELECT COALESCE(tag_status, 'unvalidated'), COUNT(*)
            FROM images WHERE ingest_status = 'ready'
            GROUP BY 1
        """)).fetchall())
    total = sum(counts.values()) or 1

    print(f"\nProcessed this run: {processed} ({results})")
    print("Corpus tag quality:")
    for status in ("verified", "provisional", "quarantined", "unvalidated"):
        n = counts.get(status, 0)
        print(f"  {status:12s} {n:6d}  ({100 * n / total:.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
