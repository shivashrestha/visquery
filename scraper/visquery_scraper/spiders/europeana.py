"""
Europeana spider.

Harvests CC-licensed architectural images from the Europeana REST API v2.

Requires EUROPEANA_API_KEY environment variable (set in .env or Scrapy settings).
Only items with open/CC/PD reusability are collected.
Rate limit: 1 req/sec.
"""

import json
import logging
import re
import urllib.parse
from typing import Any, Generator, Iterator

import scrapy
from scrapy.exceptions import NotConfigured

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

EUROPEANA_SEARCH_URL = "https://api.europeana.eu/record/v2/search.json"

# Accepted reusability values in Europeana API
ACCEPTED_REUSABILITY = ("open", "permission")

# EDM rights URIs that indicate acceptable licensing
ACCEPTED_RIGHTS_PATTERNS = (
    r"creativecommons\.org/licenses/by[^n]",   # CC-BY, CC-BY-SA (not CC-BY-NC)
    r"creativecommons\.org/licenses/by-sa",
    r"creativecommons\.org/publicdomain",
    r"creativecommons\.org/licenses/cc0",
    r"rightsstatements\.org/vocab/(NoC|NKC|CNE)",   # no known copyright / public domain
)

_ACCEPTED_RE = re.compile("|".join(ACCEPTED_RIGHTS_PATTERNS), re.IGNORECASE)

# Search query
QUERY = "architecture"
ROWS_PER_PAGE = 100

# Fields to request
EUROPEANA_FIELDS = [
    "id",
    "title",
    "dcDescription",
    "dcCreator",
    "dcDate",
    "edmPreview",
    "edmIsShownBy",
    "edmRights",
    "rights",
    "guid",
    "link",
    "provider",
    "dataProvider",
    "year",
    "language",
]


def _normalise_license_from_rights(rights_list: list) -> str:
    """Map an edmRights URI to a human-readable license string."""
    for rights in rights_list:
        r = str(rights).lower()
        if "publicdomain/zero" in r or "cc0" in r:
            return "CC0-1.0"
        if "publicdomain/mark" in r:
            return "Public Domain"
        if "licenses/by-sa" in r:
            # Extract version
            m = re.search(r"/(\d+\.\d+)", r)
            version = m.group(1) if m else "4.0"
            return f"CC-BY-SA-{version}"
        if "licenses/by/" in r or "licenses/by-" in r:
            m = re.search(r"/(\d+\.\d+)", r)
            version = m.group(1) if m else "4.0"
            return f"CC-BY-{version}"
        if "rightsstatements.org" in r:
            return "Public Domain"
    return "Unknown"


class EuropeanaSpider(scrapy.Spider):
    name = "europeana"
    allowed_domains = ["api.europeana.eu", "europeana.eu"]

    custom_settings = {
        "DOWNLOAD_DELAY": 1.0,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "USER_AGENT": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
    }

    def __init__(self, query: str = QUERY, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._query = query

    @classmethod
    def from_crawler(cls, crawler, *args, **kwargs):
        spider = super().from_crawler(crawler, *args, **kwargs)
        api_key = crawler.settings.get("EUROPEANA_API_KEY", "")
        if not api_key:
            raise NotConfigured(
                "EUROPEANA_API_KEY not set. "
                "Add it to your .env file or pass -s EUROPEANA_API_KEY=xxx"
            )
        spider._api_key = api_key
        return spider

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def start_requests(self) -> Iterator[scrapy.Request]:
        yield self._search_request(cursor="*")

    # ------------------------------------------------------------------
    # Search pagination (cursor-based)
    # ------------------------------------------------------------------

    def _search_request(self, cursor: str) -> scrapy.Request:
        params = {
            "wskey": self._api_key,
            "query": self._query,
            "reusability": "open",
            "media": "true",
            "thumbnail": "true",
            "rows": ROWS_PER_PAGE,
            "cursor": cursor,
            "profile": "rich",
            "fl": ",".join(EUROPEANA_FIELDS),
        }
        url = f"{EUROPEANA_SEARCH_URL}?{urllib.parse.urlencode(params)}"
        return scrapy.Request(
            url,
            callback=self._parse_search,
            cb_kwargs={"cursor": cursor},
            headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
        )

    def _parse_search(
        self, response: scrapy.http.Response, cursor: str
    ) -> Generator:
        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.error("Failed to parse Europeana JSON (cursor=%s)", cursor)
            return

        if not data.get("success"):
            logger.error("Europeana API error: %s", data.get("error", "unknown"))
            return

        items = data.get("items", [])
        logger.info(
            "Europeana: processing %d items (cursor=%s, total=%s)",
            len(items),
            cursor,
            data.get("totalResults"),
        )

        for record in items:
            yield from self._item_from_record(record)

        # Cursor-based pagination
        next_cursor = data.get("nextCursor")
        if next_cursor and items:
            yield self._search_request(cursor=next_cursor)

    # ------------------------------------------------------------------
    # Record → Item
    # ------------------------------------------------------------------

    def _item_from_record(self, record: dict) -> Generator:
        # Image URL — prefer edmIsShownBy (full-size), fall back to edmPreview
        image_url = None
        for key in ("edmIsShownBy", "edmPreview"):
            val = record.get(key)
            if isinstance(val, list):
                val = val[0] if val else None
            if val and isinstance(val, str) and val.startswith("http"):
                image_url = val
                break

        if not image_url:
            logger.debug("No image URL for Europeana record %s", record.get("id"))
            return

        # Rights / license check
        rights_raw = record.get("rights", record.get("edmRights", []))
        if isinstance(rights_raw, str):
            rights_raw = [rights_raw]

        if not any(_ACCEPTED_RE.search(str(r)) for r in rights_raw):
            logger.debug(
                "Rejected Europeana record %s — rights: %s",
                record.get("id"),
                rights_raw,
            )
            return

        license_str = _normalise_license_from_rights(rights_raw)

        # Title
        title_raw = record.get("title", [])
        if isinstance(title_raw, str):
            title_raw = [title_raw]
        title = title_raw[0] if title_raw else "Untitled"

        # Creator
        creator_raw = record.get("dcCreator", [])
        if isinstance(creator_raw, str):
            creator_raw = [creator_raw]
        authors = creator_raw if creator_raw else None

        # Description
        desc_raw = record.get("dcDescription", [])
        if isinstance(desc_raw, str):
            desc_raw = [desc_raw]
        text_excerpt = " ".join(desc_raw)[:1000]

        # Date
        date_raw = record.get("year") or record.get("dcDate", [])
        if isinstance(date_raw, list):
            date_raw = date_raw[0] if date_raw else None
        publish_date = str(date_raw)[:10] if date_raw else None

        # Source page URL
        source_url = record.get("guid") or record.get("link") or ""
        if isinstance(source_url, list):
            source_url = source_url[0] if source_url else ""

        # Provider
        provider = record.get("dataProvider") or record.get("provider")
        if isinstance(provider, list):
            provider = provider[0] if provider else None

        item = ArchitectureImageItem(
            url=image_url,
            storage_path=None,
            sha256=None,
            phash=None,
            width=0,
            height=0,
            photographer=authors[0] if authors else None,
            license=license_str,
            license_url=rights_raw[0] if rights_raw else None,
            source_url=source_url,
            source_title=title,
            publication=str(provider) if provider else "Europeana",
            authors=authors,
            publish_date=publish_date,
            text_excerpt=text_excerpt,
            spider_name=self.name,
            wikidata_id=None,
            near_duplicate_of=None,
            raw_metadata=record,
        )
        yield item
