# Visquery

Architectural precedent-search for architects. Describe what you're looking for in plain language — a curved corner facade, a thick wall that becomes furniture, a courtyard that mediates between public and private — and Visquery returns 30 strong precedents from open architectural archives with structured metadata, a grounded explanation, and source citations.

Built on a LoRA-fine-tuned CLIP model, hybrid retrieval, and diversity-aware reranking. All data from CC-licensed and public-domain sources with full provenance.

---

## How it works

### Request flow

```
User query (text)
  → Router (Claude Haiku) — classifies intent: concept / visual / metadata-only / hybrid
  → Rewriter (llama3.1:8b) — decomposes into visual sub-queries, extracts hard filters
  → Filter — applies period / typology / material / climate constraints
  → CLIP FAISS index — top-100 nearest neighbours per sub-query
  → RRF Fusion — merges ranked lists from multiple sub-queries
  → Reranker (BAAI/bge-reranker-base) — cross-encoder rerank against original query
  → MMR (λ=0.7) — diversity reranking to suppress near-duplicates
  → Synthesizer (mid LLM) — one-sentence grounded explanation per result
  → Citation linker — attaches source URL, license, photographer
  → Frontend (Next.js) — result grid with building cards and feedback buttons
```

### Offline ingestion pipeline

```
Image + metadata (Postgres: sources + images)
  → Captioner worker — vision LLM generates structured caption JSON
  → Embedder — CLIP ViT-B/32 → 512-d vector
  → FAISS indexer — appends to IndexFlatIP, persists id_map
  → Metadata extractor — LLM extracts building entity (name, architect, year, typology…)
  → Building entity upsert (Postgres: buildings)
```

---

## Data storage

### Postgres tables

| Table | Description |
|---|---|
| `sources` | One row per scraped page: URL, title, publication, authors, publish date, spider name |
| `images` | One row per image: storage path, sha256, pHash, dimensions, caption, license, photographer, `building_id` (FK), `source_id` (FK), raw scraper metadata |
| `buildings` | Extracted building entities: name, architect, year, location, typology[], materials[], structural system, climate zone |
| `feedback` | Per-result thumbs up/down from users: query text, `result_image_id`, rating, session id |

All primary keys are UUIDs. `images.building_id` is NULL until the metadata extractor runs.

### FAISS indexes

Two `IndexFlatIP` (inner-product) indexes stored under `FAISS_DATA_DIR` (default `/data/faiss`):

- `clip_<embedding_version>.index` — 512-d CLIP embeddings, one vector per image
- `clip_<embedding_version>_id_map.json` — maps FAISS integer index position → image UUID

FAISS indexes are rebuilt by running the embedder over all images and writing the index files. They are **not** persisted in Postgres — they live on the worker/API volume.

### Object storage

Images are stored at paths of the form `<spider_name>/<sha256[:2]>/<sha256>.<ext>`.

- **Local dev**: volume mount at `/data/images` (set `STORAGE_BACKEND=local`)
- **Production**: S3-compatible object store (Backblaze B2 or Supabase Storage) configured via `OBJECT_STORAGE_*` env vars

The `images.storage_path` column stores either the absolute local path or the object-key suffix.

---

## Manual data loading (current approach)

The Scrapy spiders are incomplete and unreliable. Load data manually using the RQ ingest worker directly.

### Step 1 — Download images and write rows to Postgres

For each image, insert rows into `sources` and `images` using psql or a script:

```sql
-- 1. Insert source
INSERT INTO sources (url, title, publication, spider_name)
VALUES ('https://commons.wikimedia.org/wiki/File:Example.jpg',
        'Example building', 'Wikimedia Commons', 'manual')
RETURNING id;

-- 2. Insert image (use source id from above)
INSERT INTO images (source_id, url, license, source_title)
VALUES ('<source-uuid>',
        'https://upload.wikimedia.org/wikipedia/commons/...jpg',
        'CC-BY-SA-4.0',
        'Example building')
RETURNING id;
```

### Step 2 — Download image file to the storage volume

```bash
# Images volume is mounted at ./data/images (or /data/images inside Docker)
mkdir -p data/images/manual/ab
curl -L "https://upload.wikimedia.org/.../Example.jpg" \
     -o "data/images/manual/ab/<sha256>.jpg"

# Update the storage_path column
psql $DATABASE_URL -c "
  UPDATE images SET storage_path = 'manual/ab/<sha256>.jpg'
  WHERE id = '<image-uuid>'
"
```

### Step 3 — Enqueue the ingest job

The RQ worker captions, embeds, and links the building entity:

```python
import redis
from rq import Queue
from app.workers.ingest_worker import ingest_image

r = redis.from_url("redis://localhost:6379/0")
q = Queue("ingest", connection=r)

q.enqueue(ingest_image,
    storage_path="/data/images/manual/ab/<sha256>.jpg",
    source_url="https://commons.wikimedia.org/wiki/File:Example.jpg",
    source_title="Example building",
    source_license="CC-BY-SA-4.0",
    spider_name="manual",
    photographer="Author Name",
    raw_text_excerpt="Short description of the building for metadata extraction.",
)
```

Or call `ingest_image()` directly (synchronous) when running outside Docker.

### Step 4 — Rebuild FAISS indexes

After loading a batch of images, rebuild the FAISS indexes:

```bash
# Inside the backend container (or virtualenv)
python -c "
from app.services.vector_store import rebuild_index
rebuild_index()
"
```

---

## Running locally

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, LLM_PROVIDER, API keys.

docker compose up
```

- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- Stats: `http://localhost:8000/admin/stats`

For HTTPS with a real domain set `DOMAIN=yourdomain.com` — Caddy handles Let's Encrypt automatically.

---

## Repository layout

```
backend/        FastAPI app, retrieval pipeline, ingestion workers
  app/
    routers/    search, images, feedback, admin endpoints
    services/   embedder, retrieval pipeline, vector store, reranker, MMR
    workers/    RQ jobs: captioner, metadata extractor, ingest orchestrator
    models/     SQLAlchemy ORM: Building, Image, Source, Feedback
    prompts/    LLM prompt templates: router, rewriter, synthesizer
    vocabularies/  Controlled lists: typology, materials, structural, climate
  migrations/   init.sql — Postgres schema (runs on first docker compose up)
scraper/        Scrapy spiders (incomplete — use manual loading for now)
ml/             LoRA fine-tuning scripts, training data, checkpoints
frontend/       Next.js app
eval/           Evaluation harness, labeled queries, metrics
```

---

## Retrieval pipeline stages

| # | Stage | Model | Notes |
|---|---|---|---|
| 1 | Router | Claude Haiku | Classifies query intent |
| 2 | Rewriter | llama3.1:8b | Expands to sub-queries + filters |
| 3 | Filter | — | Period, typology, material, climate |
| 4 | Vector search | CLIP ViT-B/32 | Top-100 per sub-query, FAISS |
| 5 | Fusion | RRF | Merges sub-query ranked lists |
| 6 | Reranker | bge-reranker-base | Cross-encoder, top-30 |
| 7 | MMR | — | λ=0.7 diversity reranking |
| 8 | Synthesizer | mid LLM | Grounded explanation per result |
| 9 | Citation | — | URL, license, photographer |

---

## Evaluation

Seven retrieval configurations compared against 150 architect-curated queries (nDCG@30 headline metric):

| Config | Embedder | Filters | Rerank | Rewrite | MMR | nDCG@30 |
|---|---|---|---|---|---|---|
| `baseline` | base CLIP | | | | | — |
| `clip_filters` | base CLIP | ✓ | | | | — |
| `clip_rerank` | base CLIP | ✓ | ✓ | | | — |
| `tuned_clip` | LoRA-tuned | ✓ | | | | — |
| `tuned_rerank` | LoRA-tuned | ✓ | ✓ | | | — |
| `full_no_mmr` | LoRA-tuned | ✓ | ✓ | ✓ | | — |
| `full` | LoRA-tuned | ✓ | ✓ | ✓ | ✓ | — |

Results populated after evaluation corpus is finalized. See `eval/notebook.ipynb`.

---

## Memory budget (6 GB VPS)

| Component | ~RAM |
|---|---|
| CLIP ViT-B/32 (fine-tuned) | 700 MB |
| bge-reranker-base | 500 MB |
| FastAPI + uvicorn | 200 MB |
| Postgres | 400 MB |
| Redis | 100 MB |
| FAISS indexes | 150 MB |
| Headroom | 950 MB |
| **Total** | **~3.0 GB** |

All heavy models use CPU inference and are singleton-loaded lazily on first request.

---

## Configuration

Key environment variables (see `.env.example` for full list):

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://visquery:changeme@postgres:5432/visquery` | Backend/worker DB (Docker-internal host) |
| `SCRAPER_DATABASE_URL` | `postgresql://visquery:changeme@localhost:5432/visquery` | Scraper DB (host-side, uses `localhost`) |
| `CLIP_CHECKPOINT_PATH` | _(empty)_ | Path to merged LoRA checkpoint; empty = base weights |
| `LLM_PROVIDER` | `ollama` | `anthropic` or `ollama` |
| `FUSION_METHOD` | `rrf` | `clip_only`, `weighted`, or `rrf` |
| `MMR_LAMBDA` | `0.7` | Diversity/relevance trade-off |
| `TOP_K_RETRIEVE` | `100` | Candidate pool size before reranking |
| `TOP_K_FINAL` | `30` | Final results returned |
| `EMBEDDING_VERSION` | `base` | Version tag written to every vector row |
| `FAISS_DATA_DIR` | `/data/faiss` | Where FAISS index files are stored |
| `STORAGE_BACKEND` | `local` | `local` or `supabase` |

---

## License

Source code: MIT. Data licenses vary per image — see the `images.license` column.
