"""
Scrapy Item definitions for the Visquery scraper.
"""

import scrapy


class ArchitectureImageItem(scrapy.Item):
    """
    Canonical item produced by every Visquery spider.

    Pipeline stages read/write fields in-place; the item is finally
    handed to PersistPipeline which writes it to Postgres + object storage.
    """

    # ------------------------------------------------------------------
    # Image location
    # ------------------------------------------------------------------
    url = scrapy.Field()           # str  — original image URL
    storage_path = scrapy.Field()  # str  — path/key in object storage (set by PersistPipeline)

    # ------------------------------------------------------------------
    # Image fingerprints (set by DedupePipeline)
    # ------------------------------------------------------------------
    sha256 = scrapy.Field()        # str  — hex digest of raw image bytes
    phash = scrapy.Field()         # str  — perceptual hash hex string

    # ------------------------------------------------------------------
    # Image dimensions (set by DedupePipeline after download)
    # ------------------------------------------------------------------
    width = scrapy.Field()         # int
    height = scrapy.Field()        # int

    # ------------------------------------------------------------------
    # Attribution / provenance
    # ------------------------------------------------------------------
    photographer = scrapy.Field()  # str | None
    license = scrapy.Field()       # str  — normalised SPDX-like identifier, e.g. 'CC-BY-4.0'
    license_url = scrapy.Field()   # str | None
    source_url = scrapy.Field()    # str  — web page the image came from
    source_title = scrapy.Field()  # str  — page / file title
    publication = scrapy.Field()   # str | None — journal, repository, etc.
    authors = scrapy.Field()       # list[str] | None
    publish_date = scrapy.Field()  # str | None — ISO-8601 date string preferred

    # ------------------------------------------------------------------
    # Textual grounding
    # ------------------------------------------------------------------
    text_excerpt = scrapy.Field()  # str  — surrounding caption / description

    # ------------------------------------------------------------------
    # Internal tracking
    # ------------------------------------------------------------------
    spider_name = scrapy.Field()   # str  — Scrapy spider name
    wikidata_id = scrapy.Field()   # str | None — e.g. 'Q12345'

    # ------------------------------------------------------------------
    # Near-duplicate flag (set by DedupePipeline)
    # ------------------------------------------------------------------
    near_duplicate_of = scrapy.Field()  # str | None — sha256 of the similar image

    # ------------------------------------------------------------------
    # Raw metadata (full API response kept for reprocessing)
    # ------------------------------------------------------------------
    raw_metadata = scrapy.Field()  # dict
