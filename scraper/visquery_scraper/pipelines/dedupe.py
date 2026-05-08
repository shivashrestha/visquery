"""
Deduplicate Pipeline (priority 200).

Two-stage deduplication:
  1. SHA-256 exact match  → drop the item (exact duplicate).
  2. pHash near-duplicate  → tag item.near_duplicate_of (don't drop).

This pipeline downloads the image bytes in order to:
  - Compute sha256.
  - Compute perceptual hash (pHash) via imagehash.
  - Determine actual width/height.

If the image download fails the item is still passed through with
sha256=None and phash=None so that it can be persisted with a note.

The pipeline maintains an in-memory set of seen sha256 hashes for the
current run (fast path), and falls back to Postgres for cross-run checks.

Database table assumed:
    CREATE TABLE IF NOT EXISTS images (
        sha256 TEXT PRIMARY KEY,
        phash  TEXT,
        ...
    );
"""

import hashlib
import io
import logging
from typing import Optional

import imagehash
import psycopg2
import psycopg2.extras
from PIL import Image
from scrapy.exceptions import DropItem

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

# Hamming distance threshold for near-duplicate flagging
PHASH_DISTANCE_THRESHOLD = 10

# Number of most-recent pHashes to keep in memory for fast comparison.
# Full cross-run comparison is done against Postgres.
MEMORY_PHASH_CACHE_SIZE = 50_000


class DedupePipeline:
    """
    Downloads image bytes, computes sha256 + pHash, and deduplicates.
    """

    def open_spider(self, spider) -> None:
        self._seen_sha256: set[str] = set()
        # List of (phash_obj, sha256) for in-memory near-dup search
        self._phash_cache: list[tuple] = []

        db_url = spider.crawler.settings.get("DATABASE_URL", "")
        self._conn: Optional[psycopg2.extensions.connection] = None
        if db_url:
            try:
                self._conn = psycopg2.connect(db_url)
                self._conn.autocommit = True
                self._load_existing_hashes()
                logger.info("DedupePipeline: connected to Postgres")
            except Exception as exc:
                logger.warning(
                    "DedupePipeline: could not connect to Postgres (%s). "
                    "Running in-memory only.",
                    exc,
                )
        else:
            logger.warning("DedupePipeline: DATABASE_URL not set, running in-memory only.")

    def _load_existing_hashes(self) -> None:
        """Pre-load sha256 + phash values from the DB into memory caches."""
        if self._conn is None:
            return
        try:
            with self._conn.cursor() as cur:
                cur.execute(
                    "SELECT sha256, phash FROM images WHERE sha256 IS NOT NULL"
                )
                rows = cur.fetchall()
            for sha256, phash_str in rows:
                self._seen_sha256.add(sha256)
                if phash_str:
                    try:
                        ph = imagehash.hex_to_hash(phash_str)
                        if len(self._phash_cache) < MEMORY_PHASH_CACHE_SIZE:
                            self._phash_cache.append((ph, sha256))
                    except Exception:
                        pass
            logger.info(
                "DedupePipeline: loaded %d existing sha256 hashes from DB",
                len(self._seen_sha256),
            )
        except Exception as exc:
            logger.warning("DedupePipeline: failed to load existing hashes: %s", exc)

    def close_spider(self, spider) -> None:
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
        logger.info(
            "DedupePipeline closed — %d unique sha256 in memory", len(self._seen_sha256)
        )

    # ------------------------------------------------------------------
    # Main processing
    # ------------------------------------------------------------------

    def process_item(
        self, item: ArchitectureImageItem, spider
    ) -> ArchitectureImageItem:
        image_url = item.get("url", "")
        if not image_url or not image_url.startswith("http"):
            # No downloadable image (e.g. DSpace PDF URL) — pass through
            return item

        # Download image bytes
        image_bytes = self._download_bytes(image_url, spider)
        if image_bytes is None:
            logger.debug("Could not download image for dedup: %s", image_url)
            return item

        # Compute sha256
        sha256 = hashlib.sha256(image_bytes).hexdigest()

        # Exact duplicate check
        if sha256 in self._seen_sha256:
            spider.crawler.stats.inc_value("dedupe/exact_duplicate_dropped")
            raise DropItem(f"Exact duplicate (sha256={sha256[:16]}…) — {image_url}")

        # Compute pHash
        phash_obj = None
        phash_str: Optional[str] = None
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img.load()  # Force decode
            phash_obj = imagehash.phash(img)
            phash_str = str(phash_obj)

            # Set dimensions while we have the image open
            item["width"] = img.width
            item["height"] = img.height
        except Exception as exc:
            logger.debug("pHash computation failed for %s: %s", image_url, exc)

        # Near-duplicate check
        near_dup_sha256: Optional[str] = None
        if phash_obj is not None:
            near_dup_sha256 = self._find_near_duplicate(phash_obj)
            if near_dup_sha256:
                spider.crawler.stats.inc_value("dedupe/near_duplicate_flagged")
                logger.debug(
                    "Near-duplicate flagged: %s ~ %s (pHash distance < %d)",
                    image_url,
                    near_dup_sha256[:16],
                    PHASH_DISTANCE_THRESHOLD,
                )

        # Register new entry
        self._seen_sha256.add(sha256)
        if phash_obj is not None and len(self._phash_cache) < MEMORY_PHASH_CACHE_SIZE:
            self._phash_cache.append((phash_obj, sha256))

        # Update item fields
        item["sha256"] = sha256
        item["phash"] = phash_str
        item["near_duplicate_of"] = near_dup_sha256

        spider.crawler.stats.inc_value("dedupe/new_unique")
        return item

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _download_bytes(self, url: str, spider) -> Optional[bytes]:
        """
        Synchronous HTTP download using httpx (runs inside Twisted thread pool
        via blockingCallFromThread in production, or directly in unit tests).
        We keep this simple; failures are caught and None is returned.
        """
        try:
            import httpx

            headers = {
                "User-Agent": spider.crawler.settings.get(
                    "USER_AGENT",
                    "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
                )
            }
            timeout = spider.crawler.settings.getfloat("DOWNLOAD_TIMEOUT", 30)
            with httpx.Client(follow_redirects=True, timeout=timeout) as client:
                response = client.get(url, headers=headers)
                response.raise_for_status()
                return response.content
        except Exception as exc:
            logger.debug("Image download error for %s: %s", url, exc)
            return None

    def _find_near_duplicate(self, phash_obj) -> Optional[str]:
        """
        Check in-memory pHash cache for any hash within PHASH_DISTANCE_THRESHOLD
        Hamming bits of phash_obj.  Returns the sha256 of the similar image, or None.
        """
        for existing_phash, existing_sha256 in self._phash_cache:
            try:
                dist = phash_obj - existing_phash
                if dist < PHASH_DISTANCE_THRESHOLD:
                    return existing_sha256
            except Exception:
                continue
        return None
