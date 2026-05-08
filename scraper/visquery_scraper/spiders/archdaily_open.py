"""
ArchDaily open-access spider.

Only collects articles/projects with an explicit CC license declared in
their metadata.  Uses Playwright for JS-rendered pages.

Strategy:
  1. Harvest URLs from ArchDaily's sitemap (articles + buildings sections).
  2. For each page, render with Playwright and check for CC license metadata.
  3. Extract images only when a valid CC license is confirmed.

Rate limit: 1 req/sec.  Never scrapes paywalled content.
"""

import logging
import re
import urllib.parse
from typing import Any, Generator, Iterator
from xml.etree import ElementTree as ET

import scrapy
from scrapy_playwright.page import PageMethod

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

# ArchDaily sitemaps that include open-access content
SITEMAPS = [
    "https://www.archdaily.com/sitemaps/projects-sitemap.xml",
    "https://www.archdaily.com/sitemaps/articles-sitemap.xml",
]

# Only accept these license indicators in page metadata
CC_LICENSE_PATTERNS = re.compile(
    r"creativecommons\.org/licenses/(by|by-sa|by-nd|zero|cc0)",
    re.IGNORECASE,
)
# Reject NC (non-commercial) licenses
NC_PATTERN = re.compile(r"nc", re.IGNORECASE)

# Maximum images to extract per page
MAX_IMAGES_PER_PAGE = 10


def _extract_license_from_page_html(html: str) -> tuple[str | None, str | None]:
    """
    Parse license info from page HTML.
    Returns (license_str, license_url) or (None, None) if no CC license found.
    """
    # Look for <link rel="license" href="..."> or Open Graph og:license
    link_match = re.search(
        r'<link[^>]+rel=["\']license["\'][^>]+href=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    og_match = re.search(
        r'<meta[^>]+property=["\']og:license["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    schema_match = re.search(
        r'"license"\s*:\s*"(https?://[^"]+)"',
        html,
    )

    license_url = None
    for match in (link_match, og_match, schema_match):
        if match:
            candidate = match.group(1)
            if CC_LICENSE_PATTERNS.search(candidate) and not NC_PATTERN.search(candidate):
                license_url = candidate
                break

    if not license_url:
        return None, None

    # Normalise to SPDX-like string
    if "zero" in license_url.lower() or "cc0" in license_url.lower():
        license_str = "CC0-1.0"
    elif "by-sa" in license_url.lower():
        m = re.search(r"/(\d+\.\d+)", license_url)
        version = m.group(1) if m else "4.0"
        license_str = f"CC-BY-SA-{version}"
    elif "by-nd" in license_url.lower():
        m = re.search(r"/(\d+\.\d+)", license_url)
        version = m.group(1) if m else "4.0"
        license_str = f"CC-BY-ND-{version}"
    else:
        m = re.search(r"/(\d+\.\d+)", license_url)
        version = m.group(1) if m else "4.0"
        license_str = f"CC-BY-{version}"

    return license_str, license_url


class ArchDailyOpenSpider(scrapy.Spider):
    name = "archdaily_open"
    allowed_domains = [
        "www.archdaily.com",
        "archdaily.com",
        "images.adsttc.com",
        "media.adsttc.com",
    ]

    custom_settings = {
        "DOWNLOAD_DELAY": 1.0,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "USER_AGENT": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
        # Playwright required for JS-rendered pages
        "DOWNLOAD_HANDLERS": {
            "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
            "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
        },
        "TWISTED_REACTOR": "twisted.internet.asyncioreactor.AsyncioSelectorReactor",
    }

    def __init__(
        self,
        max_pages: int = 500,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._max_pages = int(max_pages)
        self._pages_processed = 0

    # ------------------------------------------------------------------
    # Entry point — sitemap harvest
    # ------------------------------------------------------------------

    def start_requests(self) -> Iterator[scrapy.Request]:
        for sitemap_url in SITEMAPS:
            yield scrapy.Request(
                sitemap_url,
                callback=self._parse_sitemap,
                headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
            )

    def _parse_sitemap(self, response: scrapy.http.Response) -> Generator:
        """Parse a sitemap XML and yield requests for each article URL."""
        try:
            root = ET.fromstring(response.text)
        except ET.ParseError as exc:
            logger.error("Sitemap parse error %s: %s", response.url, exc)
            return

        # Handle both sitemap index and URL sitemaps
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        # Nested sitemap index
        for sitemap_el in root.findall(".//sm:sitemap/sm:loc", ns):
            if sitemap_el.text:
                yield scrapy.Request(
                    sitemap_el.text.strip(),
                    callback=self._parse_sitemap,
                    headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
                )

        # Direct URL entries
        for url_el in root.findall(".//sm:url/sm:loc", ns):
            if self._pages_processed >= self._max_pages:
                return
            if url_el.text:
                page_url = url_el.text.strip()
                yield scrapy.Request(
                    page_url,
                    callback=self._parse_article,
                    meta={
                        "playwright": True,
                        "playwright_include_page": False,
                        "playwright_page_methods": [
                            # Wait for images to load
                            PageMethod("wait_for_load_state", "domcontentloaded"),
                        ],
                    },
                    headers={"User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)"},
                )
                self._pages_processed += 1

    # ------------------------------------------------------------------
    # Article page
    # ------------------------------------------------------------------

    def _parse_article(self, response: scrapy.http.Response) -> Generator:
        html = response.text

        # License check — primary gate
        license_str, license_url = _extract_license_from_page_html(html)
        if not license_str:
            logger.debug("No CC license found on %s — skipping", response.url)
            return

        # Extract article metadata
        title = self._extract_meta(html, "og:title") or response.css("h1::text").get("Untitled")
        description = (
            self._extract_meta(html, "og:description")
            or " ".join(response.css("p::text").getall())[:500]
        )
        author_raw = self._extract_meta(html, "author") or ""
        authors = [a.strip() for a in re.split(r"[,;]", author_raw) if a.strip()] or None
        publish_date_raw = self._extract_meta(html, "article:published_time") or ""
        publish_date = publish_date_raw[:10] if publish_date_raw else None

        # Extract images from the article
        # Prefer figure/picture elements; fall back to content img tags
        image_urls: list[str] = []

        # JSON-LD structured data images
        for ld_match in re.finditer(
            r'"image"\s*:\s*(?:\[([^\]]+)\]|"([^"]+)")', html
        ):
            raw = ld_match.group(1) or ld_match.group(2)
            for url_match in re.finditer(r'"(https://[^"]+\.(?:jpg|jpeg|png|webp))"', raw or ""):
                image_urls.append(url_match.group(1))

        # og:image fallback
        og_image = self._extract_meta(html, "og:image")
        if og_image:
            image_urls.insert(0, og_image)

        # CSS selector for <img> tags in article body
        for img_src in response.css("article img::attr(src), .afd-slideshow img::attr(src)").getall():
            if img_src.startswith("http") and re.search(
                r"\.(jpg|jpeg|png|webp)(\?|$)", img_src, re.IGNORECASE
            ):
                image_urls.append(img_src)

        # De-duplicate while preserving order
        seen: set[str] = set()
        unique_images: list[str] = []
        for u in image_urls:
            if u not in seen:
                seen.add(u)
                unique_images.append(u)

        for image_url in unique_images[:MAX_IMAGES_PER_PAGE]:
            item = ArchitectureImageItem(
                url=image_url,
                storage_path=None,
                sha256=None,
                phash=None,
                width=0,
                height=0,
                photographer=authors[0] if authors else None,
                license=license_str,
                license_url=license_url,
                source_url=response.url,
                source_title=title,
                publication="ArchDaily",
                authors=authors,
                publish_date=publish_date,
                text_excerpt=description[:1000],
                spider_name=self.name,
                wikidata_id=None,
                near_duplicate_of=None,
                raw_metadata={
                    "page_url": response.url,
                    "license_url": license_url,
                    "og_title": title,
                    "og_description": description,
                },
            )
            yield item

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_meta(html: str, property_name: str) -> str | None:
        """Extract content from <meta property="..." content="..."> or name=..."""
        patterns = [
            rf'<meta[^>]+property=["\'](?:og:)?{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+name=["\'](?:og:)?{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\'](?:og:)?{re.escape(property_name)}["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None
