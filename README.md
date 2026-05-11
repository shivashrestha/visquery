<div align="center">
  <img src="frontend/public/app-logo.png" alt="Visquery" width="80" />
  <h1>Visquery</h1>
  <p><strong>Visual precedent search for architects — powered by fine-tuned CLIP and hybrid retrieval.</strong></p>
  <p>
    Describe what you're looking for in plain language — <em>a curved corner facade</em>, <em>a thick wall that becomes furniture</em>, <em>a courtyard that mediates between public and private</em> — and Visquery returns 30 strong precedents from open architectural archives with structured metadata, a grounded explanation, and source citations.
  </p>
  <p>
    <img src="https://img.shields.io/badge/CLIP-ViT--B%2F32-blue?logo=openai&logoColor=white" />
    <img src="https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white" />
    <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white" />
    <img src="https://img.shields.io/badge/FAISS-IndexFlatIP-orange" />
    <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white" />
    <img src="https://img.shields.io/badge/License-MIT-green" />
    <img src="https://img.shields.io/badge/live-visquery.com-informational?logo=vercel&logoColor=white" />
  </p>
  <p><a href="https://visquery.com">visquery.com</a></p>
</div>

---

## 🖥️ Application

### Landing Page

![Landing page](screenshot/landing-page.png)

### Search Results

![Search results](screenshot/search-result-page.png)

### Library

![Library view](screenshot/library-page.png)

### Collection

![Collection page](screenshot/collection-page.png)

### Image RAG View

![Image RAG grounded explanation](screenshot/image-rag-view.png)

---

## ⚙️ How it works

### Request flow

```
User query (text)
  → Router (Claude Haiku)       — classifies intent: concept / visual / metadata-only / hybrid
  → Rewriter (llama3.1:8b)      — decomposes into visual sub-queries, extracts hard filters
  → Filter                       — applies period / typology / material / climate constraints
  → CLIP FAISS index             — top-100 nearest neighbours per sub-query (ViT-B/32)
  → RRF Fusion                   — merges ranked lists from multiple sub-queries
  → Reranker (bge-reranker-base) — cross-encoder rerank against original query
  → MMR (λ=0.7)                  — diversity reranking to suppress near-duplicates
  → Synthesizer (mid LLM)        — one-sentence grounded explanation per result
  → Citation linker              — attaches source URL, license, photographer
  → Frontend (Next.js)           — result grid with building cards and feedback buttons
```

### Offline ingestion pipeline

```
Image + metadata (Postgres: sources + images)
  → Captioner worker        — vision LLM generates structured caption JSON
  → Embedder                — CLIP ViT-B/32 → 512-d vector
  → FAISS indexer           — appends to IndexFlatIP, persists id_map
  → Metadata extractor      — LLM extracts building entity (name, architect, year, typology…)
  → Building entity upsert  — Postgres: buildings table
```

### Retrieval pipeline stages

| # | Stage | Model | Notes |
|---|-------|-------|-------|
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

## 🤖 CLIP Fine-tuning

The retrieval embedder is a two-stage LoRA-style fine-tune of **OpenCLIP ViT-B/32** on 25 architectural style classes sourced from Wikimedia Commons (CC-licensed). The full notebook is at [`ml/finetune_clip_production_v2.ipynb`](ml/finetune_clip_production_v2.ipynb).

### Dataset

| Split | Samples | Classes |
|-------|---------|---------|
| Train | 7 018 | 25 |
| Val | 485 | 25 |

- **Min class size**: 122 images (before oversampling)
- **Oversampling**: each class upsampled to 280 with replacement; each copy gets independent augmentation → genuine variety, no duplicate gradients
- **Quality filter**: images where base CLIP zero-shot confidence for their own label < 0.05 removed before training
- **Multi-prompt training**: 5 text prompts per class, one sampled randomly each step
- **Hard-negative batching**: ~50% of each mini-batch drawn from the hardest confusion clusters (Gothic/Romanesque, Greek Revival/Colonial/Georgian, Queen Anne/Tudor/Edwardian, etc.)

**25 architectural style classes:**

> Achaemenid · American Craftsman · American Foursquare · Ancient Egyptian · Art Deco · Art Nouveau · Baroque · Bauhaus · Beaux-Arts · Byzantine · Chicago School · Colonial · Deconstructivism · Edwardian · Georgian · Gothic · Greek Revival · International Style · Novelty · Palladian · Queen Anne · Romanesque · Russian Revival · Tudor Revival _(+ more in training set)_

### Augmentation pipeline

```python
RandomResizedCrop(224, scale=(0.5, 1.0))
RandomHorizontalFlip()
ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05)
RandomGrayscale(p=0.10)
GaussianBlur(kernel_size=3)
Normalize(CLIP mean/std)
```

### Two-stage training

| Stage | Epochs | LR | Frozen layers | Purpose |
|-------|--------|----|---------------|---------|
| 1 | 1–5 | 5e-6 | Visual encoder | Train text tower + projections first |
| 2 | 6–15 | 5e-7 | All except resblocks 10 & 11 | Fine-grained visual discriminability |

**Training log (val accuracy per epoch):**

| Epoch | Loss | Val Acc | Stage |
|-------|------|---------|-------|
| 1 | 1.915 | 80.2% | 1 |
| 2 | 1.633 | 80.6% | 1 |
| 3 | 1.568 | 84.5% | 1 |
| 4 | 1.524 | 84.7% | 1 |
| 5 | 1.493 | 87.0% | 1 |
| 6 | 1.476 | 86.2% | 2 |
| 7 | 1.459 | 87.2% | 2 |
| 8 | 1.460 | 86.4% | 2 |
| 9 | 1.459 | 86.6% | 2 |
| 10 | 1.447 | 87.2% | 2 |
| 11 | 1.451 | 87.2% | 2 |
| **12** | **1.449** | **87.4%** ✓ | **2** |
| 13 | 1.449 | 87.4% | 2 |
| 14 | 1.440 | 87.0% | 2 |
| 15 | 1.455 | 87.0% | 2 |

Baseline zero-shot (base CLIP, no fine-tuning): **61.4%** → Fine-tuned best: **87.4%** (+26 pp)

### Temperature calibration

After training, logit temperature `T` is optimised on the val set to minimise Expected Calibration Error (ECE):

| | ECE |
|--|-----|
| Pre-calibration | 0.0938 |
| **Post-calibration** | **0.0559** |

### Production scorecard

![Production scorecard](ml/viz/01_scorecard.png)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Classification accuracy | 0.874 | ≥ 0.90 | ❌ |
| Macro F1 | 0.867 | ≥ 0.90 | ❌ |
| Hard-neg pass rate | 0.904 | ≥ 0.80 | ✅ |
| Semantic R@1 | 0.880 | ≥ 0.70 | ✅ |
| ECE (calibration) | 0.056 | < 0.10 | ✅ |
| Noise conf p95 | 0.466 | < 0.50 | ✅ |

**4/6 gates pass.** Accuracy and Macro F1 are below the 0.90 threshold — improvement plan: expand Georgian val set (5 support → 20+) and add harder augmentations for Baroque/International confusions.

### Retrieval metrics (image vs. full prompt bank)

| Metric | Value | Target |
|--------|-------|--------|
| R@1 | 0.880 | ≥ 0.70 ✅ |
| R@3 | 0.888 | — |
| R@5 | 0.912 | — |
| MRR | 0.901 | — |

Hard-negative discrimination: **pass rate 0.904**, mean cosine margin **0.173**.

### Confusion matrix

![Confusion matrix](ml/viz/02_confusion_matrix.png)

Hardest confusions: Baroque ↔ Beaux-Arts, International Style ↔ Bauhaus, Georgian (small val set).

### Per-class F1 & t-SNE embedding space

![Per-class F1 and t-SNE](ml/viz/03_f1_tsne.png)

**Per-class F1 (val set):**

| Class | F1 | Class | F1 |
|-------|----|-------|----|
| Art Deco | **1.000** | Edwardian | 0.923 |
| Russian Revival | **0.947** | Gothic | 0.919 |
| Novelty | **0.950** | Art Nouveau | 0.905 |
| Romanesque | **0.950** | Byzantine | 0.905 |
| Chicago School | 0.905 | Deconstructivism | 0.889 |
| Tudor Revival | 0.919 | Greek Revival | 0.864 |
| Achaemenid | 0.900 | Beaux-Arts | 0.842 |
| Ancient Egyptian | 0.900 | Palladian | 0.821 |
| Queen Anne | 0.900 | Bauhaus | 0.800 |
| American Foursquare | 0.895 | Colonial | 0.800 |
| American Craftsman | 0.791 | International Style | 0.739 |
| Baroque | 0.769 | Georgian | 0.600 ⚠️ |

Georgian low F1 is a val-set size artefact (5 samples). All other classes ≥ 0.739.

### Calibration & OOD confidence

![Calibration and OOD](ml/viz/04_calibration_ood.png)

OOD (noise images) confidence: mean **0.355**, p95 **0.466** — model does not over-confidently assign random images to known classes.

### ONNX export

Two variants exported for production deployment:

| Format | File | Notes |
|--------|------|-------|
| FP32 | `ml/checkpoints/clip_visual_fp32.onnx` | Full precision, CPU inference |
| INT8 | `ml/checkpoints/clip_visual_int8.onnx` | Quantised, target p95 latency < 200 ms |

Checkpoint: `ml/checkpoints/best_clip_v2.pt` (epoch 12, val acc 0.874).  
Artifacts (text embeddings cache): `ml/checkpoints/artifacts/clip_artifacts.pkl`.

---

## 🗄️ Data storage

### Postgres tables

| Table | Description |
|-------|-------------|
| `sources` | One row per scraped page: URL, title, publication, authors, publish date, spider name |
| `images` | One row per image: storage path, sha256, pHash, dimensions, caption, license, photographer, `building_id` FK, `source_id` FK |
| `buildings` | Extracted entities: name, architect, year, location, typology[], materials[], structural system, climate zone |
| `feedback` | Per-result thumbs up/down: query text, `result_image_id`, rating, session id |

All primary keys are UUIDs. `images.building_id` is NULL until the metadata extractor runs.

### FAISS indexes

Two `IndexFlatIP` (inner-product) indexes under `FAISS_DATA_DIR` (default `/data/faiss`):

- `clip_<embedding_version>.index` — 512-d CLIP embeddings, one vector per image
- `clip_<embedding_version>_id_map.json` — maps FAISS integer position → image UUID

Indexes are rebuilt by running the embedder; they are **not** persisted in Postgres.

### Object storage

Images stored at `<spider_name>/<sha256[:2]>/<sha256>.<ext>`.

- **Local dev**: volume at `/data/images` (`STORAGE_BACKEND=local`)
- **Production**: S3-compatible store (Backblaze B2 / Supabase) via `OBJECT_STORAGE_*` env vars

---

## 📥 Manual data loading

The Scrapy spiders are incomplete. Load images via the RQ ingest worker directly.

### Step 1 — Insert rows into Postgres

```sql
-- Insert source
INSERT INTO sources (url, title, publication, spider_name)
VALUES ('https://commons.wikimedia.org/wiki/File:Example.jpg',
        'Example building', 'Wikimedia Commons', 'manual')
RETURNING id;

-- Insert image (use source id from above)
INSERT INTO images (source_id, url, license, source_title)
VALUES ('<source-uuid>',
        'https://upload.wikimedia.org/wikipedia/commons/...jpg',
        'CC-BY-SA-4.0',
        'Example building')
RETURNING id;
```

### Step 2 — Download image file

```bash
mkdir -p data/images/manual/ab
curl -L "https://upload.wikimedia.org/.../Example.jpg" \
     -o "data/images/manual/ab/<sha256>.jpg"

psql $DATABASE_URL -c "
  UPDATE images SET storage_path = 'manual/ab/<sha256>.jpg'
  WHERE id = '<image-uuid>'
"
```

### Step 3 — Enqueue ingest job

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
    raw_text_excerpt="Short description of the building.",
)
```

Or call `ingest_image()` directly (synchronous) outside Docker.

### Step 4 — Rebuild FAISS indexes

```bash
python -c "
from app.services.vector_store import rebuild_index
rebuild_index()
"
```

---

## 🚀 Running locally

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, LLM_PROVIDER, API keys.

docker compose up
```

| Endpoint | URL |
|----------|-----|
| API | `http://localhost:8000` |
| API docs | `http://localhost:8000/docs` |
| Admin stats | `http://localhost:8000/admin/stats` |
| Frontend | `http://localhost:3000` |

For HTTPS with a real domain, set `DOMAIN=yourdomain.com` — Caddy handles Let's Encrypt automatically.

---

## 📁 Repository layout

```
backend/                    FastAPI app, retrieval pipeline, ingestion workers
  app/
    routers/                search, images, feedback, admin endpoints
    services/               embedder, retrieval pipeline, vector store, reranker, MMR
    workers/                RQ jobs: captioner, metadata extractor, ingest orchestrator
    models/                 SQLAlchemy ORM: Building, Image, Source, Feedback
    prompts/                LLM prompt templates: router, rewriter, synthesizer
  migrations/               init.sql — Postgres schema
scraper/                    Scrapy spiders (use manual loading for now)
ml/                         Fine-tuning notebook, training data, checkpoints
  finetune_clip_production_v2.ipynb   Main training notebook
  arch-datasets/            25 class image folders
  checkpoints/
    best_clip_v2.pt         Best model weights (epoch 12)
    clip_visual_fp32.onnx   Production visual encoder (FP32)
    clip_visual_int8.onnx   Production visual encoder (INT8 quantised)
    artifacts/
      clip_artifacts.pkl    Cached text embeddings for all 25 classes
      viz/                  Training visualisations (scorecard, confusion, F1, calibration)
frontend/                   Next.js app
  app/                      App router pages
  public/                   Static assets (logo)
screenshot/                 App screenshots
eval/                       Evaluation harness, labeled queries, metrics
```

---

## 🧠 Memory budget (6 GB VPS)

| Component | ~RAM |
|-----------|------|
| CLIP ViT-B/32 (fine-tuned, ONNX INT8) | 700 MB |
| bge-reranker-base | 500 MB |
| FastAPI + uvicorn | 200 MB |
| Postgres | 400 MB |
| Redis | 100 MB |
| FAISS indexes | 150 MB |
| Headroom | 950 MB |
| **Total** | **~3.0 GB** |

All heavy models use CPU inference and are singleton-loaded lazily on first request.

---

## 🔧 Configuration

Key environment variables (see `.env.example` for full list):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://visquery:changeme@postgres:5432/visquery` | Backend/worker DB |
| `SCRAPER_DATABASE_URL` | `postgresql://visquery:changeme@localhost:5432/visquery` | Scraper DB (host-side) |
| `CLIP_CHECKPOINT_PATH` | _(empty)_ | Path to ONNX INT8 checkpoint; empty = base weights |
| `LLM_PROVIDER` | `ollama` | `anthropic` or `ollama` |
| `FUSION_METHOD` | `rrf` | `clip_only`, `weighted`, or `rrf` |
| `MMR_LAMBDA` | `0.7` | Diversity/relevance trade-off |
| `TOP_K_RETRIEVE` | `100` | Candidate pool size before reranking |
| `TOP_K_FINAL` | `30` | Final results returned |
| `EMBEDDING_VERSION` | `base` | Version tag written to every vector row |
| `FAISS_DATA_DIR` | `/data/faiss` | Where FAISS index files live |
| `STORAGE_BACKEND` | `local` | `local` or `supabase` |

---

## 📊 Evaluation

Seven retrieval configurations compared against architect-curated queries (nDCG@30 headline metric):

| Config | Embedder | Filters | Rerank | Rewrite | MMR | nDCG@30 |
|--------|----------|---------|--------|---------|-----|---------|
| `baseline` | base CLIP | | | | | — |
| `clip_filters` | base CLIP | ✓ | | | | — |
| `clip_rerank` | base CLIP | ✓ | ✓ | | | — |
| `tuned_clip` | LoRA-tuned | ✓ | | | | — |
| `tuned_rerank` | LoRA-tuned | ✓ | ✓ | | | — |
| `full_no_mmr` | LoRA-tuned | ✓ | ✓ | ✓ | | — |
| `full` | LoRA-tuned | ✓ | ✓ | ✓ | ✓ | — |

Results populated after evaluation corpus finalised. See `eval/notebook.ipynb`.

---

## 📄 License

Source code: **MIT** © [visquery.com](https://visquery.com). Data licenses vary per image — see `images.license` column. All training data sourced from CC-licensed and public-domain archives with full provenance.
