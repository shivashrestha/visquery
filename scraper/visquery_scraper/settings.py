"""
Scrapy settings for visquery_scraper project.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Project identity
# ---------------------------------------------------------------------------
BOT_NAME = "visquery_scraper"
SPIDER_MODULES = ["visquery_scraper.spiders"]
NEWSPIDER_MODULE = "visquery_scraper.spiders"

USER_AGENT = "Visquery/0.1 (contact: shivashrestha44@gmail.com)"

# ---------------------------------------------------------------------------
# Crawl behaviour
# ---------------------------------------------------------------------------
ROBOTSTXT_OBEY = True

# Polite defaults; individual spiders may tighten further via custom_settings
DOWNLOAD_DELAY = 1.0
RANDOMIZE_DOWNLOAD_DELAY = True   # actual delay = 0.5–1.5 × DOWNLOAD_DELAY

CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2
CONCURRENT_REQUESTS_PER_IP = 0   # disabled, rely on per-domain

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1.0
AUTOTHROTTLE_MAX_DELAY = 10.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 2.0
AUTOTHROTTLE_DEBUG = False

# ---------------------------------------------------------------------------
# HTTP settings
# ---------------------------------------------------------------------------
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en",
}

# Timeouts
DOWNLOAD_TIMEOUT = 30

# Retry
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# ---------------------------------------------------------------------------
# Feeds / serialisation
# ---------------------------------------------------------------------------
FEED_EXPORT_ENCODING = "utf-8"

# ---------------------------------------------------------------------------
# Item pipelines
# ---------------------------------------------------------------------------
ITEM_PIPELINES = {
    "visquery_scraper.pipelines.license_validator.LicenseValidatorPipeline": 100,
    "visquery_scraper.pipelines.dedupe.DedupePipeline": 200,
    "visquery_scraper.pipelines.persist.PersistPipeline": 300,
}

# ---------------------------------------------------------------------------
# Extensions
# ---------------------------------------------------------------------------
EXTENSIONS = {
    # Built-in stats logging
    "scrapy.extensions.corestats.CoreStats": 0,
    "scrapy.extensions.logstats.LogStats": 0,
    # Graceful close on item/page limits
    "scrapy.extensions.closespider.CloseSpider": 0,
}

# Log stats every 60 s
LOGSTATS_INTERVAL = 60

# ---------------------------------------------------------------------------
# Playwright (archdaily_open spider only — see its custom_settings)
# ---------------------------------------------------------------------------
# Do NOT enable Playwright globally — it breaks spiders that use regular HTTP.
# The archdaily_open spider sets DOWNLOAD_HANDLERS in its own custom_settings.
PLAYWRIGHT_BROWSER_TYPE = "chromium"
PLAYWRIGHT_LAUNCH_OPTIONS = {
    "headless": True,
    "args": ["--no-sandbox", "--disable-setuid-sandbox"],
}
PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT = 30_000  # ms

# ---------------------------------------------------------------------------
# Database / storage (read from environment)
# ---------------------------------------------------------------------------
# SCRAPER_DATABASE_URL lets you override the host when running the scraper
# locally against a Dockerized Postgres (use localhost:5432 instead of
# the Docker-internal hostname "postgres").
DATABASE_URL = os.getenv(
    "SCRAPER_DATABASE_URL",
    os.getenv("DATABASE_URL", "postgresql://visquery:changeme@localhost:5432/visquery"),
)

STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")  # 'local' | 'supabase'
STORAGE_LOCAL_PATH = os.getenv("STORAGE_LOCAL_PATH", "./data/images")

REDIS_URL = os.getenv("REDIS_URL", "")
EMBEDDING_VERSION = os.getenv("EMBEDDING_VERSION", "2")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "architecture-images")

# ---------------------------------------------------------------------------
# External API keys
# ---------------------------------------------------------------------------
EUROPEANA_API_KEY = os.getenv("EUROPEANA_API_KEY", "boaccumb")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("SCRAPY_LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s [%(name)s] %(levelname)s: %(message)s"
