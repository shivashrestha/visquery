"""
Library of Congress HABS/HAER spider.

Harvests Historic American Buildings Survey (HABS) and Historic American
Engineering Record (HAER) records via two complementary endpoints:

  1. LOC JSON API  — paginated search results with thumbnail URLs
  2. OAI-PMH       — full Dublin Core metadata for each record

All HABS/HAER content is in the public domain.
Rate limit: 1 req/sec.
"""

import json
import logging
import re
import urllib.parse
from typing import Any, Generator, Iterator
from xml.etree import ElementTree as ET

import scrapy

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

# LOC JSON search API
LOC_SEARCH_URL = "https://www.loc.gov/photos/"
LOC_SEARCH_PARAMS = {
    "q": "architecture",
    "fa": "online-format:image|contributor:historic+american+buildings+survey",
    "fo": "json",
    "c": 25,   # results per page
    "sp": 1,   # starting page
}

# OAI-PMH endpoint
OAI_BASE = "https://www.loc.gov/cgi-bin/oai2.pl"
OAI_SETS = ["habs", "haer"]
OAI_METADATA_PREFIX = "oai_dc"
OAI_PAGE_SIZE = 100

# Dublin Core namespace
DC_NS = "http://purl.org/dc/elements/1.1/"
OAI_NS = "http://www.openarchives.org/OAI/2.0/"
OAI_DC_NS = "http://www.openarchives.org/OAI/2.0/oai_dc/"


class LocHabsSpider(scrapy.Spider):
    name = "loc_habs"
    allowed_domains = ["www.loc.gov", "cdn.loc.gov", "tile.loc.gov"]

    custom_settings = {
        "DOWNLOAD_DELAY": 1.0,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "USER_AGENT": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
    }

    def __init__(
        self,
        use_oai: bool = True,
        use_json_api: bool = True,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._use_oai = str(use_oai).lower() not in ("false", "0", "no")
        self._use_json_api = str(use_json_api).lower() not in ("false", "0", "no")

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def start_requests(self) -> Iterator[scrapy.Request]:
        if self._use_json_api:
            params = dict(LOC_SEARCH_PARAMS)
            url = f"{LOC_SEARCH_URL}?{urllib.parse.urlencode(params)}"
            yield scrapy.Request(
                url,
                callback=self._parse_json_search,
                cb_kwargs={"page": 1},
                headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
            )

        if self._use_oai:
            for oai_set in OAI_SETS:
                yield self._oai_list_records(oai_set)

    # ------------------------------------------------------------------
    # LOC JSON API path
    # ------------------------------------------------------------------

    def _parse_json_search(
        self, response: scrapy.http.Response, page: int
    ) -> Generator:
        try:
            data = json.loads(response.text)
        except json.JSONDecodeError:
            logger.error("Failed to parse LOC JSON response (page %d)", page)
            return

        results = data.get("results", [])
        for result in results:
            yield from self._item_from_json_result(result)

        # Pagination
        pagination = data.get("pagination", {})
        next_page = pagination.get("next")
        if next_page:
            yield scrapy.Request(
                next_page,
                callback=self._parse_json_search,
                cb_kwargs={"page": page + 1},
                headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
            )

    def _item_from_json_result(self, result: dict) -> Generator:
        """Extract an ArchitectureImageItem from a single LOC JSON result."""
        # Locate the best available image URL
        image_url = None
        for key in ("image_url", "thumbnail"):
            candidate = result.get(key)
            if isinstance(candidate, list):
                candidate = candidate[0] if candidate else None
            if candidate and isinstance(candidate, str):
                # Prefer full-size; LOC thumbnail URLs can be upgraded
                image_url = candidate.replace("_s.jpg", "_q175.jpg")
                break

        if not image_url:
            return

        # Extract Dublin Core-like fields available in JSON response
        title = result.get("title", "Untitled")
        contributor = result.get("contributor", [])
        if isinstance(contributor, str):
            contributor = [contributor]
        description_parts = result.get("description", [])
        if isinstance(description_parts, str):
            description_parts = [description_parts]
        date_raw = result.get("date", "")
        source_url = result.get("url", "")

        item = ArchitectureImageItem(
            url=image_url,
            storage_path=None,
            sha256=None,
            phash=None,
            width=0,
            height=0,
            photographer=None,
            license="Public Domain",
            license_url="https://creativecommons.org/publicdomain/mark/1.0/",
            source_url=source_url,
            source_title=title,
            publication="Library of Congress HABS/HAER",
            authors=contributor or None,
            publish_date=date_raw[:10] if date_raw else None,
            text_excerpt=" ".join(description_parts)[:1000],
            spider_name=self.name,
            wikidata_id=None,
            near_duplicate_of=None,
            raw_metadata=result,
        )
        yield item

    # ------------------------------------------------------------------
    # OAI-PMH path
    # ------------------------------------------------------------------

    def _oai_list_records(
        self, oai_set: str, resumption_token: str | None = None
    ) -> scrapy.Request:
        if resumption_token:
            params = {
                "verb": "ListRecords",
                "resumptionToken": resumption_token,
            }
        else:
            params = {
                "verb": "ListRecords",
                "metadataPrefix": OAI_METADATA_PREFIX,
                "set": oai_set,
            }
        url = f"{OAI_BASE}?{urllib.parse.urlencode(params)}"
        return scrapy.Request(
            url,
            callback=self._parse_oai_records,
            cb_kwargs={"oai_set": oai_set},
            headers={
                "User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
                "Accept": "application/xml, text/xml, */*",
            },
        )

    def _parse_oai_records(
        self, response: scrapy.http.Response, oai_set: str
    ) -> Generator:
        try:
            root = ET.fromstring(response.text)
        except ET.ParseError as exc:
            logger.error("OAI XML parse error for set %s: %s", oai_set, exc)
            return

        ns = {"oai": OAI_NS, "dc": DC_NS, "oai_dc": OAI_DC_NS}

        for record in root.findall(".//oai:record", ns):
            header = record.find("oai:header", ns)
            if header is not None and header.get("status") == "deleted":
                continue

            metadata_el = record.find(".//oai_dc:dc", ns)
            if metadata_el is None:
                continue

            def dc_values(tag: str) -> list[str]:
                return [
                    el.text.strip()
                    for el in metadata_el.findall(f"dc:{tag}", ns)
                    if el.text
                ]

            titles = dc_values("title")
            descriptions = dc_values("description")
            creators = dc_values("creator")
            dates = dc_values("date")
            identifiers = dc_values("identifier")

            # Find image URL from identifiers (LOC HABS identifiers include PURL + image URLs)
            image_url = None
            source_url = None
            for ident in identifiers:
                if re.search(r"\.(jpg|jpeg|tif|tiff|png)$", ident, re.IGNORECASE):
                    if image_url is None:
                        image_url = ident
                elif ident.startswith("http"):
                    if source_url is None:
                        source_url = ident

            if not image_url:
                # Try to construct image URL from LOC resource identifier
                for ident in identifiers:
                    if "loc.gov/resource" in ident or "hdl.loc.gov" in ident:
                        # LOC resources can serve images at /service/pnp/...
                        image_url = None  # Will skip without a direct image URL
                        source_url = ident
                        break

            if not image_url:
                logger.debug("No image URL found in OAI record: %s", identifiers)
                continue

            item = ArchitectureImageItem(
                url=image_url,
                storage_path=None,
                sha256=None,
                phash=None,
                width=0,
                height=0,
                photographer=None,
                license="Public Domain",
                license_url="https://creativecommons.org/publicdomain/mark/1.0/",
                source_url=source_url or image_url,
                source_title=titles[0] if titles else "Untitled",
                publication=f"Library of Congress {oai_set.upper()}",
                authors=creators or None,
                publish_date=dates[0][:10] if dates else None,
                text_excerpt=" ".join(descriptions)[:1000],
                spider_name=self.name,
                wikidata_id=None,
                near_duplicate_of=None,
                raw_metadata={
                    "titles": titles,
                    "descriptions": descriptions,
                    "creators": creators,
                    "dates": dates,
                    "identifiers": identifiers,
                    "oai_set": oai_set,
                },
            )
            yield item

        # Resumption token for next batch
        token_el = root.find(".//oai:resumptionToken", {"oai": OAI_NS})
        if token_el is not None and token_el.text and token_el.text.strip():
            yield self._oai_list_records(oai_set, resumption_token=token_el.text.strip())
