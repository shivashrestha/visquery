"""Backfill doc_chunks for already-registered documents.

Re-runs the doc_indexer for every doc_sources row that is not yet 'ready'
(or has zero chunks). Batched and resumable: rows already indexed are
skipped, so the script can be re-run safely after interruption.

Note: documents uploaded before the archive feature only had their images
extracted — the original file was discarded, so they have no doc_sources row
and cannot be backfilled. Re-upload them once to register the text.

Usage:
    python scripts/backfill_doc_chunks.py [--batch-size 5] [--retry-failed]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sqlalchemy as sa
import structlog
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models.document import DocSource
from app.workers.doc_indexer import index_document

logger = structlog.get_logger()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=5, help="sources per DB query batch")
    parser.add_argument("--retry-failed", action="store_true", help="also re-index 'failed' sources")
    args = parser.parse_args()

    settings = get_settings()
    engine = sa.create_engine(settings.database_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)

    statuses = ["queued", "indexing"]
    if args.retry_failed:
        statuses.append("failed")

    done = 0
    failed = 0
    processed: set[str] = set()  # sources stay 'failed' after a failed run — never re-select
    while True:
        with Session() as db:
            q = db.query(DocSource.id, DocSource.title).filter(
                sa.or_(
                    DocSource.index_status.in_(statuses),
                    sa.and_(DocSource.index_status == "ready", DocSource.chunk_count == 0),
                )
            )
            if processed:
                q = q.filter(DocSource.id.notin_(processed))
            batch = q.order_by(DocSource.created_at.asc()).limit(args.batch_size).all()
        if not batch:
            break

        for source_id, title in batch:
            processed.add(source_id)
            logger.info("backfill_doc", source_id=str(source_id), title=title)
            result = index_document(str(source_id))
            if result.get("status") == "ok":
                done += 1
            else:
                failed += 1
                logger.error("backfill_doc_failed", source_id=str(source_id), error=result.get("error"))

    logger.info("backfill_complete", indexed=done, failed=failed)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
