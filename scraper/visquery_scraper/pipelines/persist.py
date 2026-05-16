"""
Persist Pipeline (priority 300).

Downloads each image, stores it to the configured backend, then enqueues
an RQ ingest job that handles CLIP embedding + VLM captioning + FAISS indexing.

Falls back to a direct Postgres insert (ingest_status='processing') when Redis
is unavailable, so the backend worker can still pick it up later.
"""
from __future__ import annotations

import logging
import os
import re
import urllib.parse
import uuid
from pathlib import Path
from typing import Optional

from scrapy.exceptions import DropItem

from visquery_scraper.items import ArchitectureImageItem

_STORAGE_MAX_DIM = 1920
_STORAGE_MAX_BYTES = 500 * 1024  # 500 KB

try:
    from PIL import Image as _PILImage
    import io as _io

    try:
        _RESAMPLE = _PILImage.Resampling.LANCZOS
    except AttributeError:
        _RESAMPLE = _PILImage.LANCZOS  # type: ignore[attr-defined]

    def _compress_for_storage(image_bytes: bytes) -> bytes:
        pil = _PILImage.open(_io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil.size
        if max(w, h) > _STORAGE_MAX_DIM:
            scale = _STORAGE_MAX_DIM / max(w, h)
            pil = pil.resize((int(w * scale), int(h * scale)), _RESAMPLE)
        quality = 85
        while True:
            buf = _io.BytesIO()
            pil.save(buf, "JPEG", optimize=True, quality=quality)
            if buf.tell() <= _STORAGE_MAX_BYTES or quality <= 40:
                buf.seek(0)
                return buf.read()
            quality -= 10

except ImportError:
    def _compress_for_storage(image_bytes: bytes) -> bytes:  # type: ignore[misc]
        return image_bytes

logger = logging.getLogger(__name__)


class PersistPipeline:

    def open_spider(self, spider) -> None:
        settings = spider.crawler.settings

        # -- Postgres (fallback path) --
        import psycopg2
        db_url = settings.get("DATABASE_URL", "")
        self._conn: Optional[psycopg2.extensions.connection] = None
        if db_url:
            try:
                self._conn = psycopg2.connect(db_url)
                self._conn.autocommit = False
                logger.info("PersistPipeline: connected to Postgres")
            except Exception as exc:
                logger.error("PersistPipeline: Postgres connection failed (%s)", exc)

        # -- Redis / RQ --
        redis_url = settings.get("REDIS_URL", os.getenv("REDIS_URL", ""))
        self._rq_queue = None
        if redis_url:
            try:
                import redis as redis_lib
                from rq import Queue
                r = redis_lib.from_url(redis_url)
                self._rq_queue = Queue("ingest", connection=r)
                logger.info("PersistPipeline: RQ queue connected")
            except Exception as exc:
                logger.warning("PersistPipeline: RQ unavailable (%s) — using direct DB insert", exc)

        # -- Storage --
        self._storage_backend = settings.get("STORAGE_BACKEND", "local")
        self._local_root = Path(settings.get("STORAGE_LOCAL_PATH", "./data/images"))
        if self._storage_backend == "local":
            self._local_root.mkdir(parents=True, exist_ok=True)

        self._embedding_version = settings.get("EMBEDDING_VERSION", os.getenv("EMBEDDING_VERSION", "2"))
        self._saved = 0
        self._errors = 0

    def close_spider(self, spider) -> None:
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
        logger.info(
            "PersistPipeline closed — saved=%d errors=%d (spider=%s)",
            self._saved, self._errors, spider.name,
        )

    def process_item(self, item: ArchitectureImageItem, spider) -> ArchitectureImageItem:
        try:
            storage_path = self._store_image(item, spider)
            if not storage_path:
                raise DropItem(f"Image download failed for {item.get('url')}")
            item["storage_path"] = storage_path

            if self._rq_queue:
                self._enqueue_ingest(item)
            elif self._conn:
                self._insert_image_direct(item)

            self._saved += 1
            spider.crawler.stats.inc_value("persist/saved")
            return item

        except DropItem:
            raise
        except Exception as exc:
            self._errors += 1
            spider.crawler.stats.inc_value("persist/errors")
            logger.error("PersistPipeline error for %s: %s", item.get("url", "?"), exc, exc_info=True)
            return item

    # ------------------------------------------------------------------
    # RQ path — preferred
    # ------------------------------------------------------------------

    def _enqueue_ingest(self, item: ArchitectureImageItem) -> None:
        from app.workers.ingest_worker import ingest_image
        self._rq_queue.enqueue(
            ingest_image,
            storage_path=item["storage_path"],
            source_url=item.get("source_url") or item.get("url", ""),
            source_title=item.get("source_title") or "",
            source_license=item.get("license") or "unknown",
            spider_name=item.get("spider_name") or "unknown",
            photographer=item.get("photographer"),
            license_url=item.get("license_url"),
            raw_text_excerpt=item.get("text_excerpt") or "",
            wikidata=item.get("raw_metadata"),
            job_timeout=600,
        )

    # ------------------------------------------------------------------
    # Direct DB path — fallback when Redis unavailable
    # ------------------------------------------------------------------

    def _insert_image_direct(self, item: ArchitectureImageItem) -> None:
        import psycopg2.extras

        image_id = str(uuid.uuid4())
        sha256 = item.get("sha256") or ""
        raw_metadata = item.get("raw_metadata") or {}

        with self._conn.cursor() as cur:
            # dedup check
            if sha256:
                cur.execute("SELECT id FROM images WHERE sha256 = %s", (sha256,))
                if cur.fetchone():
                    logger.debug("PersistPipeline: duplicate sha256 %s, skipping", sha256[:12])
                    self._conn.rollback()
                    return

            cur.execute(
                """
                INSERT INTO images (
                    id, storage_path, sha256, phash, width, height,
                    photographer, license, license_url,
                    source_url, source_title, source_spider,
                    embedding_version, metadata_json, tags,
                    ingest_status, metadata_ready
                ) VALUES (
                    %s::uuid, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    'processing', false
                )
                ON CONFLICT (sha256) DO NOTHING
                """,
                (
                    image_id,
                    item["storage_path"],
                    sha256 or None,
                    item.get("phash"),
                    item.get("width") or 0,
                    item.get("height") or 0,
                    item.get("photographer"),
                    item.get("license") or "unknown",
                    item.get("license_url"),
                    item.get("source_url") or item.get("url", ""),
                    item.get("source_title"),
                    item.get("spider_name"),
                    self._embedding_version,
                    psycopg2.extras.Json({
                        "text_excerpt": item.get("text_excerpt") or "",
                        **raw_metadata,
                    }),
                    [],
                ),
            )
        self._conn.commit()

    # ------------------------------------------------------------------
    # Image storage
    # ------------------------------------------------------------------

    def _store_image(self, item: ArchitectureImageItem, spider) -> Optional[str]:
        url = item.get("url", "")
        if not url or not url.startswith("http"):
            return None
        image_bytes = self._download_bytes(url, spider)
        if image_bytes is None:
            return None
        storage_path = self._derive_storage_path(item)
        if self._storage_backend == "local":
            return self._store_local(image_bytes, storage_path)
        return None

    def _derive_storage_path(self, item: ArchitectureImageItem) -> str:
        sha256 = item.get("sha256") or "unknown"
        url = item.get("url", "")
        spider_name = item.get("spider_name", "unknown")
        ext = ".jpg"  # always JPEG after storage compression
        prefix = sha256[:2] if len(sha256) >= 2 else "xx"
        return f"{spider_name}/{prefix}/{sha256}{ext}"

    def _store_local(self, image_bytes: bytes, storage_path: str) -> str:
        dest = self._local_root / storage_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        compressed = _compress_for_storage(image_bytes)
        dest.write_bytes(compressed)
        logger.debug(
            "image_stored original_kb=%d stored_kb=%d path=%s",
            len(image_bytes) // 1024,
            len(compressed) // 1024,
            dest,
        )
        return str(dest)

    def _download_bytes(self, url: str, spider) -> Optional[bytes]:
        try:
            import httpx
            user_agent = spider.crawler.settings.get("USER_AGENT", "Visquery/0.1")
            timeout = spider.crawler.settings.getfloat("DOWNLOAD_TIMEOUT", 30)
            with httpx.Client(follow_redirects=True, timeout=timeout) as client:
                response = client.get(url, headers={"User-Agent": user_agent})
                response.raise_for_status()
                return response.content
        except Exception as exc:
            logger.debug("Image download error for %s: %s", url, exc)
            return None
