"""Visquery local ingestion pipeline entry point.

Usage (inside container or with backend deps installed):
    python -m app.ingest.main

Reads images from RAW_DATA_DIR (env) or /raw_data (Docker default).
Exit codes:
  0 — all processed (ok + duplicates)
  1 — one or more images failed
  2 — no images found
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import structlog

from app.config import get_settings
from app.ingest.pipeline import IMAGE_EXTENSIONS, ingest_image

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ]
)
logger = structlog.get_logger()

_RAW_DATA_DEFAULT = Path("/raw_data")


def _raw_data_path() -> Path:
    env = os.environ.get("RAW_DATA_DIR", "")
    return Path(env) if env else _RAW_DATA_DEFAULT


def _collect_images(raw_data: Path) -> list[Path]:
    if not raw_data.exists():
        return []
    return sorted(
        p for p in raw_data.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def main() -> int:
    settings = get_settings()
    raw_data = _raw_data_path()

    logger.info(
        "ingest_run_start",
        raw_data=str(raw_data),
        storage_root=settings.storage_root,
        faiss_dir=settings.faiss_data_dir,
        embedding_version=settings.embedding_version,
    )

    images = _collect_images(raw_data)

    if not images:
        logger.info("ingest_no_images_found", path=str(raw_data))
        return 2

    logger.info("ingest_images_found", count=len(images))

    ok = skipped = failed = 0
    failed_files: list[str] = []

    for i, image_path in enumerate(images, 1):
        log = logger.bind(progress=f"{i}/{len(images)}", file=image_path.name)
        log.info("ingest_processing")

        t0 = time.monotonic()
        try:
            result = ingest_image(image_path, settings)
        except Exception as exc:
            log.error("ingest_unhandled_error", error=str(exc))
            result = {"status": "error", "file": image_path.name, "error": str(exc)}

        elapsed = round(time.monotonic() - t0, 1)

        if result["status"] == "ok":
            ok += 1
            log.info("ingest_ok", image_id=result.get("image_id"), elapsed_s=elapsed)
        elif result["status"] == "duplicate":
            skipped += 1
            log.info("ingest_duplicate", image_id=result.get("image_id"))
        else:
            failed += 1
            failed_files.append(image_path.name)
            log.error(
                "ingest_failed",
                stage=result.get("stage"),
                error=result.get("error"),
                elapsed_s=elapsed,
            )

    logger.info(
        "ingest_run_complete",
        total=len(images),
        ok=ok,
        duplicates=skipped,
        failed=failed,
    )

    if failed_files:
        logger.error("ingest_failed_files", files=failed_files)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
