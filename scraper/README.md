# Visquery Scraper

Scrapy-based subsystem that collects open-license architectural images from multiple sources for the Visquery precedent-search tool.

## Sources

| Spider | Source | License | Volume |
|--------|--------|---------|--------|
| `wikimedia` | Wikimedia Commons | CC-BY, CC-BY-SA, CC0, PD | ~60% of corpus |
| `loc_habs` | Library of Congress HABS/HAER | Public Domain | Heritage buildings |
| `europeana` | Europeana REST API | CC open licenses | European architecture |
| `archdaily_open` | ArchDaily (CC-licensed only) | CC-BY | Open-access articles |
| `theses_dspace` | MIT, TU Delft, ETH, KTH DSpace | Open access | Thesis figures |

## Setup

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
playwright install chromium

# Copy and fill in environment variables
cp .env.example .env
```

## Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/visquery
EUROPEANA_API_KEY=your_key_here
STORAGE_BACKEND=local          # or 'supabase'
STORAGE_LOCAL_PATH=./data/images
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_service_role_key
SUPABASE_BUCKET=architecture-images
```

## Running Spiders

```bash
# Run individual spider
scrapy crawl wikimedia
scrapy crawl loc_habs
scrapy crawl europeana
scrapy crawl archdaily_open
scrapy crawl theses_dspace

# With output
scrapy crawl wikimedia -o wikimedia_items.jsonl

# With custom settings
scrapy crawl wikimedia -s DOWNLOAD_DELAY=2.0 -s CLOSESPIDER_ITEMCOUNT=500
```

## Pipeline Stages

1. **LicenseValidatorPipeline** (priority 100) — drops items without redistributable license
2. **DedupePipeline** (priority 200) — sha256 exact-match drop; pHash near-duplicate flagging
3. **PersistPipeline** (priority 300) — writes to Postgres + object storage

## Item Schema

See `visquery_scraper/items.py` for the full `ArchitectureImageItem` definition.

## Architecture Notes

- All spiders obey `robots.txt` and observe a minimum 1 req/sec download delay.
- `building_id` is always `NULL` at scrape time; it is resolved later by the metadata-extraction worker.
- The DSpace spider collects PDF URLs only; figure extraction runs in a separate worker process using `marker-pdf`.
- ArchDaily spider uses Playwright for JS-rendered pages and only processes items with an explicit CC license in their metadata.
