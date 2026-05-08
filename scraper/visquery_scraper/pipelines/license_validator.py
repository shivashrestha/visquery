"""
License Validator Pipeline (priority 100).

Rejects items that do not carry a clearly redistributable open license.
Accepted: CC-BY, CC-BY-SA, CC0, Public Domain variants.
Rejected: CC-NC, CC-ND-only, paywalled, unknown.

Items that pass are left unchanged; items that fail raise DropItem.
"""

import logging
import re

from scrapy.exceptions import DropItem

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonical accepted token set (checked after normalisation)
# ---------------------------------------------------------------------------
ALLOWED_LICENSES: frozenset[str] = frozenset(
    {
        "cc-by",
        "cc by",
        "cc-by-sa",
        "cc by-sa",
        "cc0",
        "cc-zero",
        "cc zero",
        "public domain",
        "public domain mark",
        "publicdomain",
        "pd",
        "pdm",
        "pd-us",
        "pd mark",
        "no known copyright",
        "nkc",
    }
)

# Prefixes of accepted SPDX-style strings like 'CC-BY-4.0', 'CC-BY-SA-3.0 DE'
ALLOWED_SPDX_PREFIXES: tuple[str, ...] = (
    "cc-by-4.",
    "cc-by-3.",
    "cc-by-2.",
    "cc-by-sa-4.",
    "cc-by-sa-3.",
    "cc-by-sa-2.",
    "cc0-1.",
    "cc-zero-1.",
)

# If any of these strings appear in the normalised license, reject regardless
REJECTION_PATTERNS: tuple[str, ...] = (
    "nc",           # non-commercial
    "noderivatives",
    "no derivatives",
    "nd",           # sometimes appears as CC-BY-ND
    "all rights reserved",
    "proprietary",
    "not for redistribution",
    "permission required",
)

# Version suffix pattern to strip
_VERSION_RE = re.compile(r"[-/ ]\d+\.\d+.*$")


def _normalise(license_str: str) -> str:
    """
    Lower-case, strip extra whitespace, and remove trailing version numbers
    to produce a canonical token for lookup.
    """
    s = license_str.lower().strip()
    s = _VERSION_RE.sub("", s)
    # Collapse multiple spaces
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _is_allowed(license_str: str) -> bool:
    if not license_str or license_str.strip() == "":
        return False

    norm = _normalise(license_str)

    # Fast rejection — if any forbidden pattern appears, reject
    for pat in REJECTION_PATTERNS:
        if pat in norm:
            # Special case: 'cc-by-nd' — this is CC-BY-NoDerivatives, reject
            # but also make sure we don't catch 'foundation' containing 'nd'
            if pat == "nd" and re.search(r"(cc[-\s]by[-\s]nd|cc[-\s]nd)", norm):
                return False
            elif pat != "nd":
                return False

    # Exact match in allowed set
    if norm in ALLOWED_LICENSES:
        return True

    # SPDX prefix match (handles versioned strings before normalisation removed version)
    norm_full = license_str.lower().strip()
    for prefix in ALLOWED_SPDX_PREFIXES:
        if norm_full.startswith(prefix):
            return True

    # URL-based acceptance (sometimes license field contains a URL)
    if "creativecommons.org" in norm_full:
        if any(
            pat in norm_full
            for pat in (
                "/licenses/by/",
                "/licenses/by-sa/",
                "/publicdomain/zero/",
                "/publicdomain/mark/",
                "cc0",
            )
        ):
            return True

    return False


class LicenseValidatorPipeline:
    """
    Drop items with missing or non-redistributable licenses.
    Tracks counts for Scrapy's stats collector.
    """

    def open_spider(self, spider) -> None:
        self._accepted = 0
        self._rejected = 0
        logger.info("LicenseValidatorPipeline opened for spider: %s", spider.name)

    def close_spider(self, spider) -> None:
        logger.info(
            "LicenseValidatorPipeline closed — accepted=%d rejected=%d (spider=%s)",
            self._accepted,
            self._rejected,
            spider.name,
        )

    def process_item(
        self, item: ArchitectureImageItem, spider
    ) -> ArchitectureImageItem:
        license_str = item.get("license") or ""

        if _is_allowed(license_str):
            self._accepted += 1
            spider.crawler.stats.inc_value("license_validator/accepted")
            logger.debug(
                "Accepted license '%s' for %s",
                license_str,
                item.get("source_url", "unknown"),
            )
            return item
        else:
            self._rejected += 1
            spider.crawler.stats.inc_value("license_validator/rejected")
            logger.info(
                "Dropped item — invalid license '%s' — url=%s",
                license_str,
                item.get("source_url", "unknown"),
            )
            raise DropItem(
                f"License '{license_str}' is not redistributable "
                f"(source: {item.get('source_url', 'unknown')})"
            )
