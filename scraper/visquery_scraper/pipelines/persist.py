"""
Persist Pipeline (priority 300).

Writes items to:
  1. Postgres  — `sources` table (get-or-create) + `images` table (insert).
  2. Object storage — Supabase Storage bucket or local filesystem.

The `building_id` column is always NULL at scrape time; it is resolved
later by the metadata-extraction worker after entity linking.

Expected Postgres schema (create these tables before running):

    CREATE TABLE IF NOT EXISTS sources (
        id          SERIAL PRIMARY KEY,
        url         TEXT UNIQUE NOT NULL,
        title       TEXT,
        publication TEXT,
        spider_name TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS images (
        id               SERIAL PRIMARY KEY,
        source_id        INTEGER REFERENCES sources(id),
        building_id      INTEGER,          -- NULL until entity-linked
        url              TEXT NOT NULL,
        storage_path     TEXT,
        sha256           TEXT UNIQUE,
        phash            TEXT,
        width            INTEGER,
        height           INTEGER,
        photographer     TEXT,
        license          TEXT,
        license_url      TEXT,
        source_title     TEXT,
        authors          TEXT[],
        publish_date     DATE,
        text_excerpt     TEXT,
        spider_name      TEXT,
        wikidata_id      TEXT,
        near_duplicate_of TEXT,
        raw_metadata     JSONB,
        created_at       TIMESTAMPTZ DEFAULT NOW()
    );
"""

import json
import logging
import os
import re
import urllib.parse
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras
from scrapy.exceptions import DropItem

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)


class PersistPipeline:
    """
    Writes each item to Postgres and uploads the image to object storage.
    """

    def open_spider(self, spider) -> None:
        settings = spider.crawler.settings

        # -- Postgres --
        db_url = settings.get("DATABASE_URL", "")
        self._conn: Optional[psycopg2.extensions.connection] = None
        if db_url:
            try:
                self._conn = psycopg2.connect(db_url)
                self._conn.autocommit = False
                logger.info("PersistPipeline: connected to Postgres")
            except Exception as exc:
                logger.error(
                    "PersistPipeline: Postgres connection failed (%s). "
                    "Items will NOT be persisted to DB.",
                    exc,
                )
        else:
            logger.warning("PersistPipeline: DATABASE_URL not set — DB writes disabled.")

        # -- Storage backend --
        self._storage_backend = settings.get("STORAGE_BACKEND", "local")
        self._local_root = Path(settings.get("STORAGE_LOCAL_PATH", "./data/images"))

        if self._storage_backend == "local":
            self._local_root.mkdir(parents=True, exist_ok=True)
            logger.info("PersistPipeline: local storage at %s", self._local_root)
        elif self._storage_backend == "supabase":
            self._supabase_url = settings.get("SUPABASE_URL", "")
            self._supabase_key = settings.get("SUPABASE_KEY", "")
            self._supabase_bucket = settings.get("SUPABASE_BUCKET", "architecture-images")
            if not self._supabase_url or not self._supabase_key:
                logger.error(
                    "PersistPipeline: SUPABASE_URL/SUPABASE_KEY not set. "
                    "Supabase uploads will fail."
                )
        else:
            logger.warning("PersistPipeline: unknown STORAGE_BACKEND '%s'", self._storage_backend)

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
            self._saved,
            self._errors,
            spider.name,
        )

    # ------------------------------------------------------------------
    # Main processing
    # ------------------------------------------------------------------

    def process_item(
        self, item: ArchitectureImageItem, spider
    ) -> ArchitectureImageItem:
        try:
            # 1. Download and store image
            storage_path = self._store_image(item, spider)
            item["storage_path"] = storage_path

            # 2. Persist to Postgres
            if self._conn:
                self._persist_to_db(item)

            self._saved += 1
            spider.crawler.stats.inc_value("persist/saved")
            return item

        except DropItem:
            raise
        except Exception as exc:
            self._errors += 1
            spider.crawler.stats.inc_value("persist/errors")
            logger.error(
                "PersistPipeline error for %s: %s",
                item.get("url", "unknown"),
                exc,
                exc_info=True,
            )
            # Don't drop the item — log the error and continue
            return item

    # ------------------------------------------------------------------
    # Image storage
    # ------------------------------------------------------------------

    def _store_image(self, item: ArchitectureImageItem, spider) -> Optional[str]:
        """Download image bytes and write to configured storage. Returns storage path."""
        url = item.get("url", "")
        if not url or not url.startswith("http"):
            return None

        image_bytes = self._download_bytes(url, spider)
        if image_bytes is None:
            return None

        storage_path = self._derive_storage_path(item)

        if self._storage_backend == "local":
            return self._store_local(image_bytes, storage_path)
        elif self._storage_backend == "supabase":
            return self._store_supabase(image_bytes, storage_path, url)
        return None

    def _derive_storage_path(self, item: ArchitectureImageItem) -> str:
        """
        Derive a deterministic storage key from the item's sha256 + source.
        Format: <spider_name>/<sha256[:2]>/<sha256>.ext
        """
        sha256 = item.get("sha256") or "unknown"
        url = item.get("url", "")
        spider_name = item.get("spider_name", "unknown")

        # Determine file extension from URL
        parsed_path = urllib.parse.urlparse(url).path
        ext = os.path.splitext(parsed_path)[-1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".gif"):
            ext = ".jpg"  # default

        prefix = sha256[:2] if len(sha256) >= 2 else "xx"
        return f"{spider_name}/{prefix}/{sha256}{ext}"

    def _store_local(self, image_bytes: bytes, storage_path: str) -> str:
        """Write image bytes to local filesystem."""
        dest = self._local_root / storage_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(image_bytes)
        return str(dest)

    def _store_supabase(
        self, image_bytes: bytes, storage_path: str, original_url: str
    ) -> Optional[str]:
        """Upload image bytes to Supabase Storage."""
        try:
            import httpx

            upload_url = (
                f"{self._supabase_url}/storage/v1/object/"
                f"{self._supabase_bucket}/{storage_path}"
            )
            headers = {
                "Authorization": f"Bearer {self._supabase_key}",
                "Content-Type": _mime_from_path(storage_path),
            }
            with httpx.Client(timeout=60) as client:
                response = client.post(upload_url, content=image_bytes, headers=headers)
                if response.status_code in (200, 201):
                    return storage_path
                logger.warning(
                    "Supabase upload failed (%d) for %s: %s",
                    response.status_code,
                    storage_path,
                    response.text[:200],
                )
                return None
        except Exception as exc:
            logger.error("Supabase upload error for %s: %s", storage_path, exc)
            return None

    # ------------------------------------------------------------------
    # Postgres persistence
    # ------------------------------------------------------------------

    def _persist_to_db(self, item: ArchitectureImageItem) -> None:
        source_id = self._get_or_create_source(item)
        self._insert_image(item, source_id)
        self._conn.commit()

    def _get_or_create_source(self, item: ArchitectureImageItem) -> str:
        """Returns source UUID string."""
        source_url = item.get("source_url") or item.get("url", "")
        with self._conn.cursor() as cur:
            cur.execute("SELECT id FROM sources WHERE url = %s", (source_url,))
            row = cur.fetchone()
            if row:
                return str(row[0])

            cur.execute(
                """
                INSERT INTO sources (url, title, publication, authors, publish_date,
                                     text_excerpt, spider_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title
                RETURNING id
                """,
                (
                    source_url,
                    item.get("source_title") or source_url,
                    item.get("publication"),
                    item.get("authors"),
                    self._sanitise_date(item.get("publish_date")),
                    item.get("text_excerpt", ""),
                    item.get("spider_name"),
                ),
            )
            return str(cur.fetchone()[0])

    @staticmethod
    def _sanitise_date(publish_date):
        if not publish_date:
            return None
        if len(publish_date) > 10:
            publish_date = publish_date[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", publish_date):
            return None
        return publish_date

    def _insert_image(self, item: ArchitectureImageItem, source_id: str) -> None:
        raw_metadata = item.get("raw_metadata")

        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO images (
                    source_id, url, storage_path,
                    sha256, phash, width, height,
                    photographer, license, license_url,
                    source_title, wikidata_id,
                    near_duplicate_of, raw_metadata
                ) VALUES (
                    %s::uuid, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s,
                    %s, %s
                )
                ON CONFLICT (sha256) DO NOTHING
                """,
                (
                    source_id,
                    item.get("url"),
                    item.get("storage_path"),
                    item.get("sha256"),
                    item.get("phash"),
                    item.get("width") or 0,
                    item.get("height") or 0,
                    item.get("photographer"),
                    item.get("license"),
                    item.get("license_url"),
                    item.get("source_title"),
                    item.get("wikidata_id"),
                    item.get("near_duplicate_of"),
                    psycopg2.extras.Json(raw_metadata) if raw_metadata else None,
                ),
            )

    # ------------------------------------------------------------------
    # HTTP helper
    # ------------------------------------------------------------------

    def _download_bytes(self, url: str, spider) -> Optional[bytes]:
        """Download image bytes using httpx."""
        try:
            import httpx

            user_agent = spider.crawler.settings.get(
                "USER_AGENT",
                "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
            )
            timeout = spider.crawler.settings.getfloat("DOWNLOAD_TIMEOUT", 30)
            with httpx.Client(follow_redirects=True, timeout=timeout) as client:
                response = client.get(url, headers={"User-Agent": user_agent})
                response.raise_for_status()
                return response.content
        except Exception as exc:
            logger.debug("Image download error for %s: %s", url, exc)
            return None


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _mime_from_path(path: str) -> str:
    ext = os.path.splitext(path)[-1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }.get(ext, "application/octet-stream")
