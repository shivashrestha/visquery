"""
DSpace open-thesis spider.

Harvests thesis metadata + PDF URLs from multiple institutional repositories
via OAI-PMH.  Figure extraction from PDFs is intentionally deferred to a
separate worker process (using marker-pdf) — this spider only emits items
with a PDF URL and all available bibliographic metadata.

Targeted repositories:
  - MIT DSpace           (dspace.mit.edu)
  - TU Delft Repository  (repository.tudelft.nl)
  - TU Eindhoven         (research.tue.nl)
  - KTH DiVA             (kth.diva-portal.org)

All targeted content is open-access; license is read from dc:rights when
present, defaulting to the repository's blanket open-access statement.
"""

import logging
import re
import urllib.parse
from typing import Any, Generator, Iterator
from xml.etree import ElementTree as ET

import scrapy

from visquery_scraper.items import ArchitectureImageItem

logger = logging.getLogger(__name__)

# OAI-PMH namespaces
OAI_NS = "http://www.openarchives.org/OAI/2.0/"
DC_NS = "http://purl.org/dc/elements/1.1/"
OAI_DC_NS = "http://www.openarchives.org/OAI/2.0/oai_dc/"

# Accepted open-access licenses (case-insensitive prefix matching)
ACCEPTED_LICENSE_PREFIXES = (
    "cc-by",
    "cc by",
    "cc0",
    "creative commons attribution",
    "creativecommons.org/licenses/by",
    "creativecommons.org/publicdomain",
    "open access",
    "public domain",
    "mit license",
    "apache",
)

# Repositories: (name, oai_base_url, sets_to_harvest, default_license)
REPOSITORIES: list[tuple[str, str, list[str], str]] = [
    (
        "MIT DSpace",
        "https://dspace.mit.edu/oai/request",
        ["com_1721.1_7582"],   # MIT Architecture set
        "CC-BY-NC-SA-4.0",    # MIT default; overridden by per-record dc:rights
    ),
    (
        "TU Delft",
        "https://repository.tudelft.nl/oai",
        ["driver"],           # DRIVER set; filter by subject in parsing
        "CC-BY-4.0",
    ),
    (
        "TU Eindhoven",
        "https://research.tue.nl/oai",
        ["Architecture"],
        "CC-BY-4.0",
    ),
    (
        "KTH DiVA",
        "https://kth.diva-portal.org/smash/export.jsf",
        [],                   # DiVA uses different export; handled separately
        "CC-BY-4.0",
    ),
]

ARCHITECTURE_KEYWORDS = frozenset(
    {
        "architecture",
        "building",
        "urban",
        "facade",
        "structural",
        "architectural",
        "housing",
        "dwelling",
        "landscape",
    }
)


def _is_architecture_related(text: str) -> bool:
    text_lower = text.lower()
    return any(kw in text_lower for kw in ARCHITECTURE_KEYWORDS)


def _resolve_license(rights_values: list[str], default: str) -> str | None:
    """
    Return a normalised license string or None if clearly NC/ND/restricted.
    """
    for rights in rights_values:
        r = rights.lower()
        # Reject clearly NC licenses unless they're the only option
        if "non-commercial" in r or "-nc-" in r or "/nc/" in r:
            continue
        for prefix in ACCEPTED_LICENSE_PREFIXES:
            if r.startswith(prefix) or prefix in r:
                if "creativecommons.org" in r:
                    if "by-sa" in r:
                        m = re.search(r"/(\d+\.\d+)", r)
                        return f"CC-BY-SA-{m.group(1) if m else '4.0'}"
                    if "by-nd" in r:
                        m = re.search(r"/(\d+\.\d+)", r)
                        return f"CC-BY-ND-{m.group(1) if m else '4.0'}"
                    if "by" in r:
                        m = re.search(r"/(\d+\.\d+)", r)
                        return f"CC-BY-{m.group(1) if m else '4.0'}"
                    if "publicdomain" in r or "zero" in r:
                        return "CC0-1.0"
                return rights  # Return raw value if not CC URI
    return default


class ThesesDspaceSpider(scrapy.Spider):
    name = "theses_dspace"
    allowed_domains = [
        "dspace.mit.edu",
        "repository.tudelft.nl",
        "research.tue.nl",
        "kth.diva-portal.org",
    ]

    custom_settings = {
        "DOWNLOAD_DELAY": 1.5,   # slightly more conservative for institutional repos
        "CONCURRENT_REQUESTS_PER_DOMAIN": 1,
        "USER_AGENT": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
    }

    def __init__(
        self,
        repos: str | None = None,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        # Allow comma-separated repo name filter from command line
        if repos:
            repo_filter = {r.strip().lower() for r in repos.split(",")}
            self._repositories = [
                r for r in REPOSITORIES if r[0].lower() in repo_filter
            ]
        else:
            self._repositories = list(REPOSITORIES)

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def start_requests(self) -> Iterator[scrapy.Request]:
        for repo_name, oai_base, oai_sets, default_license in self._repositories:
            if repo_name == "KTH DiVA":
                yield from self._kth_diva_requests(oai_base, default_license)
                continue
            if not oai_sets:
                # Harvest full repository without set filter
                yield self._oai_list_records(
                    oai_base, oai_set=None,
                    repo_name=repo_name, default_license=default_license,
                )
            else:
                for oai_set in oai_sets:
                    yield self._oai_list_records(
                        oai_base, oai_set=oai_set,
                        repo_name=repo_name, default_license=default_license,
                    )

    # ------------------------------------------------------------------
    # OAI-PMH harvest
    # ------------------------------------------------------------------

    def _oai_list_records(
        self,
        oai_base: str,
        oai_set: str | None,
        repo_name: str,
        default_license: str,
        resumption_token: str | None = None,
    ) -> scrapy.Request:
        if resumption_token:
            params: dict[str, Any] = {
                "verb": "ListRecords",
                "resumptionToken": resumption_token,
            }
        else:
            params = {
                "verb": "ListRecords",
                "metadataPrefix": "oai_dc",
            }
            if oai_set:
                params["set"] = oai_set

        url = f"{oai_base}?{urllib.parse.urlencode(params)}"
        return scrapy.Request(
            url,
            callback=self._parse_oai_records,
            cb_kwargs={
                "oai_base": oai_base,
                "oai_set": oai_set,
                "repo_name": repo_name,
                "default_license": default_license,
            },
            headers={
                "User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
                "Accept": "application/xml, text/xml, */*",
            },
        )

    def _parse_oai_records(
        self,
        response: scrapy.http.Response,
        oai_base: str,
        oai_set: str | None,
        repo_name: str,
        default_license: str,
    ) -> Generator:
        try:
            root = ET.fromstring(response.text)
        except ET.ParseError as exc:
            logger.error("OAI XML parse error from %s: %s", repo_name, exc)
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
                    if el.text and el.text.strip()
                ]

            titles = dc_values("title")
            descriptions = dc_values("description")
            creators = dc_values("creator")
            subjects = dc_values("subject")
            dates = dc_values("date")
            identifiers = dc_values("identifier")
            rights_values = dc_values("rights")
            types = dc_values("type")
            formats = dc_values("format")

            # Filter: must be architecture-related
            all_text = " ".join(titles + descriptions + subjects)
            if not _is_architecture_related(all_text):
                continue

            # Filter: must be a thesis/dissertation or contain PDF
            type_text = " ".join(types).lower()
            is_thesis = any(
                kw in type_text
                for kw in ("thesis", "dissertation", "bachelor", "master", "doctoral")
            )

            # Find PDF URL(s)
            pdf_urls: list[str] = []
            source_url: str | None = None
            for ident in identifiers:
                if re.search(r"\.pdf(\?|$)", ident, re.IGNORECASE):
                    pdf_urls.append(ident)
                elif ident.startswith("http"):
                    if source_url is None:
                        source_url = ident

            if not pdf_urls and not is_thesis:
                continue

            # Resolve license
            license_str = _resolve_license(rights_values, default_license)
            if license_str is None:
                logger.debug("Rejected thesis item from %s — no acceptable license", repo_name)
                continue

            # Best publication date
            publish_date = None
            for d in dates:
                if re.match(r"\d{4}", d):
                    publish_date = d[:10]
                    break

            # Primary PDF URL used as the "image URL" here
            # (actual figure extraction happens in the worker)
            primary_pdf_url = pdf_urls[0] if pdf_urls else source_url
            if not primary_pdf_url:
                continue

            item = ArchitectureImageItem(
                url=primary_pdf_url,
                storage_path=None,
                sha256=None,
                phash=None,
                width=0,
                height=0,
                photographer=None,
                license=license_str,
                license_url=None,
                source_url=source_url or primary_pdf_url,
                source_title=titles[0] if titles else "Untitled Thesis",
                publication=repo_name,
                authors=creators or None,
                publish_date=publish_date,
                text_excerpt=" ".join(descriptions)[:1000],
                spider_name=self.name,
                wikidata_id=None,
                near_duplicate_of=None,
                raw_metadata={
                    "titles": titles,
                    "descriptions": descriptions,
                    "creators": creators,
                    "subjects": subjects,
                    "dates": dates,
                    "identifiers": identifiers,
                    "rights": rights_values,
                    "types": types,
                    "formats": formats,
                    "pdf_urls": pdf_urls,
                    "repo_name": repo_name,
                    "is_thesis": is_thesis,
                },
            )
            yield item

        # Resumption token → next batch
        token_el = root.find(".//oai:resumptionToken", {"oai": OAI_NS})
        if token_el is not None and token_el.text and token_el.text.strip():
            yield self._oai_list_records(
                oai_base,
                oai_set=oai_set,
                repo_name=repo_name,
                default_license=default_license,
                resumption_token=token_el.text.strip(),
            )

    # ------------------------------------------------------------------
    # KTH DiVA — different export format
    # ------------------------------------------------------------------

    def _kth_diva_requests(
        self, base_url: str, default_license: str
    ) -> Iterator[scrapy.Request]:
        """
        KTH DiVA uses a custom export endpoint rather than standard OAI-PMH.
        Fetch records in batches via the DiVA search export.
        """
        # DiVA supports OAI-PMH on a different path
        oai_url = "https://kth.diva-portal.org/dice/oai"
        for subject_set in ["architecture", "art"]:
            params = {
                "verb": "ListRecords",
                "metadataPrefix": "oai_dc",
                "set": f"subject:{subject_set}",
            }
            url = f"{oai_url}?{urllib.parse.urlencode(params)}"
            yield scrapy.Request(
                url,
                callback=self._parse_oai_records,
                cb_kwargs={
                    "oai_base": oai_url,
                    "oai_set": f"subject:{subject_set}",
                    "repo_name": "KTH DiVA",
                    "default_license": default_license,
                },
                headers={
                    "User-Agent": "Visquery/0.1 (contact: shivashrestha44@gmail.com)",
                    "Accept": "application/xml, text/xml, */*",
                },
            )
