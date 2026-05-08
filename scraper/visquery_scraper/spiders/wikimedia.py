"""
Wikimedia Commons spider.

Harvests architecture photographs via the MediaWiki API, traversing
Category:Architecture_photographs and its subcategories.

Rate limit: 1 req/sec (DOWNLOAD_DELAY=1 in custom_settings).
Only images with CC-BY, CC-BY-SA, CC0, or public-domain licenses are yielded.
"""

import json
import logging
import urllib.parse
from typing import Any, Generator, Iterator

import scrapy

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

# MediaWiki API endpoint
API_URL = "https://commons.wikimedia.org/w/api.php"

# Root category to start harvesting from
ROOT_CATEGORY = "Category:Architecture_photographs"

# Maximum members to request per API call (API hard-cap is 500 for registered, 50 for anon)
CATEGORY_LIMIT = 50

# Licenses we accept (checked after normalisation to lowercase)
ACCEPTED_LICENSES: frozenset[str] = frozenset(
    {
        "cc-by",
        "cc by",
        "cc-by-sa",
        "cc by-sa",
        "cc0",
        "cc-zero",
        "public domain",
        "pd",
        "pdm",
    }
)


def _normalise_license(raw: str) -> str:
    """Strip version numbers and extra whitespace for broad matching."""
    cleaned = raw.lower().strip()
    # Remove trailing version like '-4.0', '-2.0', etc.
    import re
    cleaned = re.sub(r"[-/ ]\d+\.\d+$", "", cleaned)
    return cleaned


def _is_accepted(license_str: str) -> bool:
    norm = _normalise_license(license_str)
    if norm in ACCEPTED_LICENSES:
        return True
    # Prefix match for variants like 'cc-by-sa-3.0 de'
    for accepted in ACCEPTED_LICENSES:
        if norm.startswith(accepted):
            return True
    return False


class WikimediaSpider(scrapy.Spider):
    name = "wikimedia"
    allowed_domains = ["commons.wikimedia.org", "upload.wikimedia.org"]

    custom_settings = {
        "DOWNLOAD_DELAY": 1.0,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "USER_AGENT": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
    }

    def __init__(
        self,
        categories: str | None = None,
        max_depth: int = 2,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        # Allow comma-separated category override from command line
        if categories:
            self._start_categories = [c.strip() for c in categories.split(",")]
        else:
            self._start_categories = [ROOT_CATEGORY]
        self._max_depth = int(max_depth)
        # Track visited categories to avoid cycles
        self._visited_categories: set[str] = set()

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def start_requests(self) -> Iterator[scrapy.Request]:
        for category in self._start_categories:
            yield self._category_request(category, depth=0)

    # ------------------------------------------------------------------
    # Category traversal
    # ------------------------------------------------------------------

    def _category_request(
        self, category: str, depth: int, cmcontinue: str | None = None
    ) -> scrapy.Request:
        """Build a request that lists members (files + subcategories) of *category*."""
        params: dict[str, Any] = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmlimit": CATEGORY_LIMIT,
            "cmtype": "file|subcat",
            "format": "json",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue

        url = f"{API_URL}?{urllib.parse.urlencode(params)}"
        return scrapy.Request(
            url,
            callback=self._parse_category,
            cb_kwargs={"category": category, "depth": depth},
            headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
            dont_filter=True,
        )

    def _parse_category(
        self, response: scrapy.http.Response, category: str, depth: int
    ) -> Generator:
        self._visited_categories.add(category)

        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.error("Failed to parse category JSON for %s", category)
            return

        members = data.get("query", {}).get("categorymembers", [])
        for member in members:
            ns = member.get("ns", -1)
            title = member.get("title", "")

            if ns == 6:  # File namespace
                yield self._file_info_request(title)
            elif ns == 14 and depth < self._max_depth:  # Category namespace
                if title not in self._visited_categories:
                    yield self._category_request(title, depth + 1)

        # Pagination
        cont = data.get("continue", {}).get("cmcontinue")
        if cont:
            yield self._category_request(category, depth, cmcontinue=cont)

    # ------------------------------------------------------------------
    # File info
    # ------------------------------------------------------------------

    def _file_info_request(self, file_title: str) -> scrapy.Request:
        """Fetch imageinfo + categories for a single file page."""
        params = {
            "action": "query",
            "titles": file_title,
            "prop": "imageinfo|categories",
            "iiprop": "url|size|sha1|extmetadata|mediatype",
            "iiextmetadatafilter": (
                "LicenseShortName|UsageTerms|AttributionRequired|"
                "Artist|ImageDescription|DateTimeOriginal|Credit"
            ),
            "iilimit": 1,
            "clshow": "!hidden",
            "cllimit": 20,
            "format": "json",
        }
        url = f"{API_URL}?{urllib.parse.urlencode(params)}"
        return scrapy.Request(
            url,
            callback=self._parse_file_info,
            cb_kwargs={"file_title": file_title},
            headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
        )

    def _parse_file_info(
        self, response: scrapy.http.Response, file_title: str
    ) -> Generator:
        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.error("Failed to parse file JSON for %s", file_title)
            return

        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            if page_id == "-1":
                logger.debug("File not found: %s", file_title)
                continue

            imageinfo_list = page.get("imageinfo", [])
            if not imageinfo_list:
                logger.debug("No imageinfo for %s", file_title)
                continue

            ii = imageinfo_list[0]
            media_type = ii.get("mediatype", "")
            if media_type.upper() not in ("BITMAP", "DRAWING"):
                # Skip audio, video, text, etc.
                continue

            extmeta = ii.get("extmetadata", {})

            # -- License check --
            raw_license = extmeta.get("LicenseShortName", {}).get("value", "")
            if not raw_license:
                raw_license = extmeta.get("UsageTerms", {}).get("value", "")
            if not _is_accepted(raw_license):
                logger.debug(
                    "Rejected license '%s' for %s", raw_license, file_title
                )
                continue

            image_url = ii.get("url", "")
            if not image_url:
                continue

            # -- Extract metadata --
            artist_html = extmeta.get("Artist", {}).get("value", "")
            # Strip HTML tags from artist field
            import re
            photographer = re.sub(r"<[^>]+>", "", artist_html).strip() or None

            description = extmeta.get("ImageDescription", {}).get("value", "")
            description = re.sub(r"<[^>]+>", "", description).strip()

            date_raw = extmeta.get("DateTimeOriginal", {}).get("value", "")
            # Extract just the date part if it includes time
            date_match = re.search(r"\d{4}-\d{2}-\d{2}", date_raw)
            publish_date = date_match.group(0) if date_match else (date_raw[:10] if date_raw else None)

            categories = [
                c.get("title", "").replace("Category:", "")
                for c in page.get("categories", [])
            ]

            # Attempt to find Wikidata ID from page properties (best-effort)
            wikidata_id: str | None = None

            item = ArchitectureImageItem(
                url=image_url,
                storage_path=None,
                sha256=ii.get("sha1", ""),  # sha1 from API; DedupePipeline computes sha256
                phash=None,
                width=ii.get("width", 0),
                height=ii.get("height", 0),
                photographer=photographer,
                license=raw_license,
                license_url=extmeta.get("LicenseUrl", {}).get("value"),
                source_url=f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(file_title.replace(' ', '_'))}",
                source_title=file_title,
                publication="Wikimedia Commons",
                authors=None,
                publish_date=publish_date,
                text_excerpt=description[:1000] if description else "",
                spider_name=self.name,
                wikidata_id=wikidata_id,
                near_duplicate_of=None,
                raw_metadata={
                    "extmetadata": extmeta,
                    "categories": categories,
                    "page_id": page_id,
                    "imageinfo": ii,
                },
            )
            yield item
