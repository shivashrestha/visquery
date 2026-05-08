# Visquery — Build Spec

> **What it is:** a precedent-search tool for architects, students, and researchers.
> **What it does:** finds visually and conceptually relevant buildings from open architectural sources, with grounded explanations.
> **Audience for this doc:** a coding agent (Claude Code, Cursor) or you in vibe-coding mode.
> **Optimization target:** retrieval quality on architect-curated queries, measured rigorously.

---

## 0. North Star

An architect describes a design idea — *"buildings that turn the corner with a curved facade"* or *"thick walls that become furniture"* — and Visquery returns 20-30 strong precedents, each with image, structured metadata, source citation, and a one-line explanation of why it matches.

The defensible technical claim:

*"Visquery combines four retrieval signals — domain-tuned CLIP for visual semantics, structured architectural metadata, query-rewriting for concept decomposition, and diversity-aware reranking — fused into a single pipeline that is independently evaluated against an architect-curated query set with graded relevance scoring."*

---

## 1. Users and value, exactly

| User | What they want | How Visquery helps |
|---|---|---|
| Architect in concept phase | 20-30 strong precedents for a vague design idea | Concept search surfaces precedents Pinterest and ArchDaily miss |
| Architecture student | Build visual literacy, write studio reports with cited examples | Discover + cite, with proper attribution |
| Researcher / writer | Rigorous retrieval with provenance | Every result links to the source document with license info |

**Out of scope:** generation, social features, mood boards, "saved boards," following users.

---

## 2. Constraints (read first)

- **Compute:** local NVIDIA RTX 4 GB VRAM, 16 GB system RAM. Fine-tuning is feasible on small models with LoRA + gradient checkpointing.
- **VPS:** 6 GB RAM ceiling for production.
- **Data:** 100% open-license sources. No proprietary catalogs. Per-image license tracking is mandatory.
- **Hosted dependencies:** allowed only for the LLM layer (Ollama Cloud or Anthropic API). Everything else open-source and local.
- **Eval-first culture:** if a component does not move the eval, it does not ship.

---

## 3. Five Core Capabilities

These are the features that ship in v1. Each is independently evaluated.

### 3.1 Concept search (hero feature)
Natural-language queries decomposed by an LLM into visual + conceptual + metadata components, retrieved via hybrid search, reranked for diversity.

### 3.2 Visual reference search
Upload an image, find buildings exhibiting the same architectural ideas. Pure CLIP image-to-image with reranker.

### 3.3 Structured filters
Period, location, climate, typology, material, structural system. Applied as hard constraints before vector search.

### 3.4 Diverse results
MMR (Maximum Marginal Relevance) reranking ensures top-12 shows variety, not near-duplicates.

### 3.5 Grounded explanations
Each result card shows a one-sentence explanation citing the source document. LLM constrained to summarize from metadata + scraped text — never invent.

**Stretch goals (post-v1):** region-of-interest search via SAM2; user feedback loop driving continuous learning; saved-search alerts.

---

## 4. Architecture at a Glance

```
┌────────────────────────────────────────────────────────┐
│  Frontend (Next.js on Vercel)                          │
│  Image-forward gallery, search, filter sidebar         │
└────────────────────────┬───────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼───────────────────────────────┐
│  Backend (FastAPI on VPS, behind Caddy)                │
│  /search /image /feedback /jobs /admin                 │
└────────────────────────┬───────────────────────────────┘
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
  ┌────▼────┐       ┌────▼─────┐       ┌────▼─────┐
  │ Vector  │       │ Postgres │       │ Object   │
  │ FAISS   │       │ metadata │       │ storage  │
  │ (CLIP+  │       │ + FTS    │       │ (images) │
  │  style) │       │          │       │          │
  └─────────┘       └──────────┘       └──────────┘

Offline:
  Scraper → Metadata extractor → Captioner → Embedder → Indexer
  Fine-tuner (local GPU, LoRA on CLIP)
```

**VPS resident memory:** ~3.4 GB
- Fine-tuned CLIP (~700 MB) + style/typology classifier (~300 MB) + reranker (~500 MB) + FastAPI/PG/Redis (~1 GB) + FAISS indexes (~150 MB) + headroom (~750 MB).

---

## 5. Tech Stack (final)

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.11 + FastAPI + uvicorn + pydantic-settings | Standard, typed |
| Worker queue | RQ + Redis | Lighter than Celery |
| Database | Postgres 16 (managed by Supabase or self-hosted) | Structured metadata + FTS5 alternative |
| Vector index | FAISS `IndexFlatIP`, two indexes (CLIP, style) | Exact search, deterministic eval |
| Object storage | Supabase Storage or Backblaze B2 | Cheap, S3-compatible |
| Image embeddings | LoRA-fine-tuned `open_clip` ViT-B/32 | Fits 4 GB GPU for fine-tuning |
| Style features | Gram matrices from a small VGG-16 (frozen) | Captures texture/material |
| Typology classifier (optional) | Linear head on frozen CLIP features | Enriches metadata for filters |
| Reranker | `BAAI/bge-reranker-base` | Best lift per MB |
| LLM (rewrite, synthesis) | Ollama Cloud `llama3.1:8b` or Anthropic Claude Haiku | Hosted, zero VRAM |
| Caption generator (ingest only) | Vision LLM via API | Quality > quantity for caption text |
| Scraping | Scrapy + Playwright (for JS sites) | Industry standard |
| PDF extraction | `marker-pdf` (figures + surrounding text) | Far better than PyMuPDF for journal articles |
| Frontend | Next.js 14 + Tailwind + shadcn/ui + Framer Motion | Modern, restrained |
| Reverse proxy | Caddy | Auto-HTTPS |
| Deployment | Docker Compose on VPS, Vercel for frontend | Reproducible |
| Eval | Python + Jupyter + pandas + matplotlib | Notebook-first writeup |
| Fine-tuning | PyTorch + `peft` (LoRA) + `accelerate` + gradient checkpointing | Fits 4 GB VRAM |

---

## 6. Repository Layout

```
visquery/
├── README.md
├── docker-compose.yml
├── .env.example
├── Caddyfile
│
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── deps.py
│   │   ├── models/
│   │   │   ├── building.py
│   │   │   ├── source.py
│   │   │   └── feedback.py
│   │   ├── routers/
│   │   │   ├── search.py
│   │   │   ├── images.py
│   │   │   ├── feedback.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── vector_store.py
│   │   │   ├── embedder.py            # CLIP wrapper, loads LoRA-merged checkpoint
│   │   │   ├── style.py               # Gram-matrix features
│   │   │   ├── reranker.py
│   │   │   ├── llm.py                 # Ollama / Anthropic client
│   │   │   ├── retrieval.py           # the orchestrator
│   │   │   ├── mmr.py                 # diversity reranking
│   │   │   └── agents.py              # router, rewriter, synthesizer prompts
│   │   └── workers/
│   │       ├── ingest_worker.py
│   │       ├── captioner.py
│   │       └── metadata_extractor.py
│   └── tests/
│
├── scraper/
│   ├── pyproject.toml
│   ├── scrapy.cfg
│   ├── visquery_scraper/
│   │   ├── settings.py
│   │   ├── spiders/
│   │   │   ├── wikimedia.py
│   │   │   ├── loc_habs.py
│   │   │   ├── europeana.py
│   │   │   ├── archdaily_open.py      # only CC content
│   │   │   └── theses_dspace.py
│   │   └── pipelines/
│   │       ├── license_validator.py
│   │       ├── dedupe.py
│   │       └── persist.py
│   └── README.md
│
├── ml/
│   ├── pyproject.toml
│   ├── data/
│   │   ├── pairs/                     # contrastive training pairs
│   │   └── README.md                  # how the labeled set was built
│   ├── training/
│   │   ├── lora_clip.py               # the fine-tuning script
│   │   ├── config.yaml
│   │   └── eval_during_training.py
│   ├── checkpoints/                   # gitignored; final merged weights versioned by SHA
│   └── notebooks/
│       └── label_pairs.ipynb          # how to build the pair set
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── app/
│       ├── page.tsx                   # gallery + search
│       ├── building/[id]/page.tsx     # detail view
│       ├── api/
│       └── components/
│           ├── SearchBar.tsx
│           ├── FilterSidebar.tsx
│           ├── ResultGrid.tsx         # mixed-size, image-forward
│           ├── BuildingCard.tsx
│           ├── BuildingModal.tsx
│           ├── GroundedAnswer.tsx
│           └── FeedbackButtons.tsx
│
└── eval/
    ├── README.md
    ├── queries.json                   # 150 labeled queries (FROZEN per eval run)
    ├── relevance_protocol.md          # how labels were assigned
    ├── configs/
    │   ├── baseline.yaml              # off-the-shelf CLIP
    │   ├── clip_filters.yaml          # CLIP + structured filters
    │   ├── clip_rerank.yaml
    │   ├── tuned_clip.yaml            # LoRA-fine-tuned CLIP
    │   ├── tuned_rerank.yaml
    │   ├── full_no_mmr.yaml           # rewrite + tuned + rerank
    │   └── full.yaml                  # rewrite + tuned + rerank + MMR
    ├── runner.py
    ├── metrics.py                     # nDCG, recall, MRR, diversity, latency
    ├── results/
    └── notebook.ipynb                 # the analysis writeup
```

---

## 7. Data Model

**`buildings`** (Postgres)
```
id                  UUID PRIMARY KEY
name                TEXT
architect           TEXT NULL
year_built          INTEGER NULL
year_range          INT4RANGE NULL       -- for fuzzy historical periods
location_country    TEXT NULL
location_city       TEXT NULL
latitude            DOUBLE PRECISION NULL
longitude           DOUBLE PRECISION NULL
typology            TEXT[] NULL          -- controlled vocabulary
materials           TEXT[] NULL          -- controlled vocabulary
structural_system   TEXT NULL            -- controlled vocabulary
climate_zone        TEXT NULL            -- Köppen code or simplified
description         TEXT NULL            -- cleaned summary from sources
embedding_version   TEXT                 -- which CLIP checkpoint produced the vector
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

**`images`** (Postgres)
```
id                  UUID PRIMARY KEY
building_id         UUID REFERENCES buildings(id)
storage_path        TEXT
sha256              TEXT UNIQUE
phash               TEXT
width               INTEGER
height              INTEGER
caption             TEXT                 -- vision-LLM generated, structured prompt
caption_method      TEXT                 -- 'gpt4o', 'claude-haiku', 'qwen2vl', etc.
photographer        TEXT NULL
license             TEXT                 -- 'CC-BY-4.0', 'PD', etc.
license_url         TEXT NULL
source_id           UUID REFERENCES sources(id)
embedding_version   TEXT
created_at          TIMESTAMPTZ
```

**`sources`** (Postgres)
```
id              UUID PRIMARY KEY
url             TEXT UNIQUE
title           TEXT
publication     TEXT NULL              -- e.g., "ArchDaily", "DSpace MIT"
authors         TEXT[] NULL
publish_date    DATE NULL
license         TEXT
text_excerpt    TEXT                    -- the relevant paragraph for grounding
retrieved_at    TIMESTAMPTZ
spider_name     TEXT                    -- which scraper produced this
```

**`feedback`** (Postgres)
```
id              UUID PRIMARY KEY
query_text      TEXT
result_image_id UUID REFERENCES images(id)
rating          SMALLINT                -- -1, 0, +1
reason          TEXT NULL               -- optional free text
session_id      TEXT
created_at      TIMESTAMPTZ
```

**FAISS indexes** (on disk):
- `data/faiss/clip_v{version}.index` — visual semantic embeddings
- `data/faiss/style_v{version}.index` — Gram-matrix style features

Sidecar `id_map.json` per index. Versioned so old vectors can be queried during migration.

**Controlled vocabularies** (`backend/app/vocabularies/`):
- `typology.yaml` — house, apartment, school, library, museum, ...
- `materials.yaml` — concrete, brick, timber, steel, ...
- `structural.yaml` — frame, load-bearing, shell, tensile, ...
- `climate.yaml` — Köppen subset

These are text files in version control. The metadata extractor maps freeform text into them.

---

## 8. Scraping Subsystem

This is its own first-class system, not a script.

### 8.1 Sources, in priority order

1. **Wikimedia Commons** — REST API, structured Wikidata, ~60% of corpus.
2. **Library of Congress HABS/HAER** — public-domain heritage buildings, OAI-PMH endpoints.
3. **Europeana** — REST API, CC-licensed European architecture.
4. **DSpace open theses** (MIT, TU Delft, ETH, KTH) — high-quality precedent figures with thesis text as context.
5. **Open-access architecture journals** — JAE, Architectural Histories. Per-article license check.
6. **Mapillary** — context-rich street-view, CC-BY-SA.

### 8.2 Per-spider responsibilities

Each spider:
1. Crawls within rate limits (1 req/sec default, honor robots.txt).
2. Downloads image + accompanying text + license metadata.
3. Hands off to the pipeline.

### 8.3 Pipeline stages

1. **License validator** — rejects items without a clear, redistributable license.
2. **Dedupe** — sha256 + pHash near-duplicate flagging.
3. **Persist** — writes to `sources`, `images`, downloads to object storage. `building_id` is `NULL` at this stage.

### 8.4 Metadata extraction (separate worker, runs after scraping)

For each image, an LLM is given:
- The accompanying scraped text
- Any structured Wikidata fields
- The image itself (vision LLM)

It outputs structured JSON: `{architect, year, location, typology, materials, structural_system, climate_zone, description}`. Output is validated against the controlled vocabularies — anything not in the vocab is flagged for human review or discarded.

**Multiple images of the same building are linked to a single `buildings` row** by matching on architect + name + year, with manual review for ambiguous cases.

### 8.5 Captioning (separate worker)

For each image, the vision LLM is prompted:

> "Describe this architectural image as if for an academic precedent search. Identify: (1) the building element shown (facade, plan, section, interior, detail), (2) compositional strategy (asymmetry, layering, datum lines), (3) material articulation, (4) spatial qualities, (5) structural expression. Be specific about architectural ideas, not generic descriptions. If uncertain, say so. Return JSON: {element, strategy, material, spatial, structural, summary}."

The structured JSON becomes part of the searchable index. The flat `summary` field is what the synthesizer agent uses for grounded explanations.

---

## 9. Local Fine-tuning Pipeline (the AI engineering centerpiece)

### 9.1 What is fine-tuned

LoRA on the **image encoder** of CLIP ViT-B/32. The text encoder stays frozen. This is critical for the 4 GB VRAM constraint.

LoRA config:
- Rank `r=8`, alpha=16, dropout=0.05
- Targets: attention QKV projections in the vision transformer
- Trainable params: ~0.5M of ~85M total (0.6%)
- Optimizer: AdamW, lr=1e-4, weight decay=0.01
- Batch size: 8 (gradient accumulation steps=8 → effective batch 64)
- Gradient checkpointing: ON
- Mixed precision: fp16

VRAM at this config: ~3-3.5 GB. Confirmed feasible on 4 GB.

### 9.2 Training data

**Contrastive pairs/triplets**, labeled in three ways (combine all three):

1. **Auto-labeled positives from metadata.** Two images share architect AND typology AND period → soft positive. Two images share only architect → weak positive.
2. **LLM-generated synthetic pairs.** For each image's caption JSON, ask an LLM to generate a query that should retrieve it. Use as (query, image) positive pair for image-text contrastive learning.
3. **Hand-labeled hard negatives.** ~200 carefully chosen cases where the model's mistakes are obvious to an architect (you label these). High value per label.

Target: 5K-10K positive pairs from labeling, 50K from auto-mined pairs.

### 9.3 Training script

`ml/training/lora_clip.py`:
1. Load `open_clip` ViT-B/32, freeze text encoder, attach LoRA to vision encoder.
2. Stream training data from `ml/data/pairs/`.
3. Standard CLIP contrastive loss (info-NCE) with the existing text encoder.
4. Validate every N steps on a held-out 200-pair set.
5. Save LoRA adapter checkpoints; final step merges into a deployable checkpoint.

Expected runtime: ~3-6 hours per run on a 4 GB RTX. Run overnight.

### 9.4 Deployment of the fine-tuned model

- Merge LoRA into base weights → single ViT-B/32 checkpoint, ~340 MB on disk.
- Tag with semver: `clip-v0.1.0-arch`. This becomes the `embedding_version` in the DB.
- Production CLIP service loads this checkpoint at startup.
- Re-embed entire corpus when checkpoint changes. Old vectors stay queryable until migration completes (dual-write pattern).

---

## 10. Retrieval Pipeline

```python
class RetrievalConfig:
    use_query_rewrite: bool
    embedder: Literal["base_clip", "tuned_clip"]
    use_style_index: bool
    use_filters: bool
    fusion_method: Literal["clip_only", "weighted", "rrf"]
    use_reranker: bool
    use_mmr: bool
    mmr_lambda: float = 0.7
    top_k_retrieve: int = 100
    top_k_final: int = 30
    use_grounded_synthesis: bool
```

**Pipeline order:**

1. **Router agent** — classify query intent: `concept_search` | `visual_reference` | `metadata_only` | `hybrid`. Decides which downstream stages run.
2. **Rewriter agent** — for concept queries, decompose into:
   - `visual_descriptions[]` — multiple short visual queries for CLIP
   - `keywords[]` — for FTS over captions and source text
   - `filters{}` — extracted hard constraints (period, location, material, etc.)
3. **Filter** — apply hard metadata constraints to candidate set.
4. **Vector retrieval** — for each visual description, top-K from CLIP index. Optionally fuse with style index.
5. **Fusion** — Reciprocal Rank Fusion across the multiple visual descriptions.
6. **Reranker** — cross-encoder rerank against original query.
7. **MMR** — diversity reranking, λ=0.7.
8. **Synthesizer agent** — generate one-line explanations per top result, citing source text.
9. **Citation linker** — attach source URL + license + photographer to each result.

Every step records latency. `SearchResult` carries a `LatencyBreakdown`.

### 10.1 Multi-agent decomposition (precise)

**Four specialized LLM calls.** All deterministic. None autonomous.

| Agent | Input | Output | Model |
|---|---|---|---|
| Router | user query | intent + features | Small/cheap (Haiku) |
| Rewriter | user query, intent | visual_descriptions, keywords, filters | Mid (llama3.1:8b) |
| Synthesizer | user query, top-K results with metadata | per-result explanations | Mid |
| Citer | results | source URLs, license, attribution | Deterministic, no LLM |

These are agentic *workflows*, not autonomous agents. The control flow is fixed; only the LLM outputs vary.

### 10.2 Prompts (templates in `backend/app/prompts/`)

**Rewriter** (the most important one):

> System: You decompose architectural search queries.
> User query: `{query}`
> Output JSON:
> ```
> {
>   "visual_descriptions": ["short visual phrase", "alternative phrasing"],
>   "keywords": ["term1", "term2"],
>   "filters": { "period": [start, end] | null, "typology": [...] | null, ... }
> }
> ```
> Rules: max 3 visual descriptions. Filters only when query is explicit. Do not invent constraints.

**Synthesizer:**

> System: You write one-sentence explanations for architectural search results. Use only the provided metadata and source excerpt. Never invent facts. If you cannot ground a claim, omit it.
> Query: `{query}`
> Result: `{building_metadata}`, `{source_excerpt}`
> Output: a single sentence, max 25 words, explaining why this result matches the query.

---

## 11. API Surface

```
POST  /search                  → SearchResult
GET   /buildings/{id}          → full building record
GET   /images/{id}/raw         → image bytes
POST  /feedback                → record user rating
GET   /jobs/{job_id}           → ingestion job status
GET   /admin/stats             → corpus size, embedding version, last fine-tune
GET   /health                  → basic health
GET   /metrics                 → Prometheus-style
```

**SearchRequest:**
```json
{
  "query": "buildings that turn the corner with a curved facade",
  "image_id": null,
  "filters": {
    "period": [1950, 2000],
    "typology": ["museum", "library"],
    "material": null
  },
  "config": "default"
}
```

**SearchResult:**
```json
{
  "results": [
    {
      "building_id": "...",
      "image_id": "...",
      "score": 0.87,
      "explanation": "Aalto's Finlandia Hall (1971) wraps a curved white-marble facade around an urban corner.",
      "metadata": { "architect": "Alvar Aalto", "year": 1971, ... },
      "source": { "url": "...", "license": "CC-BY-SA-4.0", "photographer": "..." }
    }
  ],
  "rewritten_query": { "visual_descriptions": [...], "filters": {...} },
  "latency_ms": { "router": 80, "rewrite": 140, "vector": 12, "rerank": 60, "mmr": 5, "synth": 220, "total": 517 }
}
```

---

## 12. Frontend (Next.js)

**Pages:**
- `/` — search bar + filter sidebar + result grid
- `/building/[id]` — detail view with all images, full metadata, source citations

**Layout principles:**
- Image-forward. Mixed-size cards (different aspect ratios), generous whitespace.
- No Pinterest-style infinite scroll. Top 30 results shown, "load more" reveals next 30.
- Filter sidebar collapsible, sticky on desktop.
- Each card shows: image, building name + architect + year, one-line explanation.
- Click → modal with all images, metadata, source citation, license, "open original" link.

**Components:**
- `SearchBar` — debounced, supports text + image drop.
- `FilterSidebar` — controlled-vocab filters, multi-select, period range slider.
- `ResultGrid` — CSS columns (true mixed-size, no JS layout).
- `BuildingCard` — restrained, no hover-tilt animations.
- `BuildingModal` — full-screen, keyboard-navigable.
- `GroundedAnswer` — single line above grid, summarizing what was found.
- `FeedbackButtons` — `+1 / -1` per result, optional reason input.

**Style:**
- shadcn defaults, customized to feel architectural.
- Color: near-monochrome with one accent. Architects are visually trained — restraint signals quality.
- Sentence case everywhere. No emoji. No gradients.
- Typography: serif for building names (e.g., GT Sectra, EB Garamond), sans for UI.

---

## 13. Evaluation Harness — the research backbone

### 13.1 The dataset (`eval/queries.json`)

150 labeled queries, balanced:
- 30 **object** queries — "spiral staircase", "courtyard"
- 30 **style** queries — "Brazilian modernism", "deconstructivism"
- 30 **concept** queries — "buildings mediating between street and courtyard"
- 30 **hybrid** queries — "post-war Italian houses with internal courtyards"
- 30 **visual reference** queries — image input, find conceptually similar buildings

**Graded relevance** — each labeled image gets a relevance score 1-3. This is essential for nDCG and matches reality (multiple correct answers, varying strength).

**Schema:**
```json
{
  "id": "q001",
  "query": "buildings that turn the corner with a curved facade",
  "query_type": "concept",
  "relevant": [
    { "building_id": "...", "relevance": 3 },
    { "building_id": "...", "relevance": 2 }
  ],
  "notes": "Curved facade specifically at street corner; not just any curve."
}
```

**Labeling protocol** documented in `eval/relevance_protocol.md`. You label these yourself with architectural domain knowledge.

### 13.2 Metrics (`eval/metrics.py`)

Implement with unit tests:

- `ndcg_at_k(predicted_ids, expected_with_grades, k)` — **headline metric**
- `recall_at_k(predicted_ids, expected_ids, k)` — coverage
- `mrr(predicted_ids, expected_ids)` — first hit position
- `diversity(predicted_embeddings)` — mean pairwise cosine distance in top-K
- `latency_summary(latencies_ms)` — p50, p95, p99, mean

### 13.3 Runner

```bash
python eval/runner.py --config configs/full.yaml --runs 3 --out results/full.json
```

For each query: run search, record predicted IDs + per-stage latency. Repeat for variance. Compute metrics overall + per query type. Emit JSON with config, model versions, git commit, timestamp.

### 13.4 Configurations to compare (the table that goes in your interview)

| Config | Embedder | Filters | Rerank | Rewrite | MMR |
|---|---|---|---|---|---|
| `baseline` | base CLIP | ✗ | ✗ | ✗ | ✗ |
| `clip_filters` | base CLIP | ✓ | ✗ | ✗ | ✗ |
| `clip_rerank` | base CLIP | ✓ | ✓ | ✗ | ✗ |
| `tuned_clip` | LoRA-tuned | ✓ | ✗ | ✗ | ✗ |
| `tuned_rerank` | LoRA-tuned | ✓ | ✓ | ✗ | ✗ |
| `full_no_mmr` | LoRA-tuned | ✓ | ✓ | ✓ | ✗ |
| `full` | LoRA-tuned | ✓ | ✓ | ✓ | ✓ |

The two key ablations that tell the research story:
- `clip_rerank` vs `tuned_rerank` — does fine-tuning move the needle?
- `full_no_mmr` vs `full` — does diversity reranking help on real architectural queries?

### 13.5 Notebook

Sections:
1. **Dataset** — what was labeled, by whom, protocol summary.
2. **Headline table** — all configs × all metrics, with mean ± std.
3. **Per-query-type breakdown** — bar charts. *Where does each technique help?*
4. **Latency decomposition** — stacked bars per config.
5. **Fine-tuning ablation** — base CLIP vs tuned CLIP, broken down by query type. The headline finding.
6. **MMR ablation** — diversity score and qualitative examples (4 dupes vs 4 distinct precedents).
7. **Wins and losses** — top 5 wins and top 5 regressions per config vs baseline.
8. **Discussion** — honest analysis. Where does the system still fail? Why?
9. **Future work** — region search, larger fine-tune, automatic eval expansion.

Style: prose-heavy, charts second. Reads like a short research note. **This is the artifact that gets you hired.**

---

## 14. Operational Concerns

**Configuration:** `pydantic-settings` + `.env`. All knobs externalized — model paths, fusion weights, MMR lambda, LLM endpoints.

**Logging:** structlog, JSON output, per-request `request_id` and `query_hash`.

**Observability:** `/metrics` exposes total searches, p95 latency, queue depth, embedding version, corpus size.

**Memory hygiene:** API process never imports captioning or fine-tuning code. Workers load heavy models lazily, release after batches. CLIP and reranker are singletons in API, lazily loaded on first request.

**Embedding versioning:** every vector tagged with `embedding_version`. Re-embeds run as background jobs. Old vectors queryable during migration. Migration completes when `count(version=current) >= count(*)`.

**Backup:** nightly tar of Postgres + FAISS to object storage. Weekly snapshot retained 90 days.

**Testing:**
- Unit tests for metrics (textbook examples)
- End-to-end: ingest 10 fixture images → search → assert top-1 is the seed
- Eval-harness sanity: stub retriever returns ~0 nDCG
- LLM agent prompts have golden-output tests for stability across model upgrades

---

## 15. Build Order (do not deviate)

1. **Repo skeleton + docker-compose up** — empty FastAPI, Postgres, Redis, worker.
2. **Controlled vocabularies** — typology.yaml, materials.yaml, structural.yaml, climate.yaml. Hand-curated.
3. **Scraper for Wikimedia + LoC** — first 1K images flowing into Postgres + storage with license tracking. No ML yet.
4. **Metadata extractor + captioner** — vision LLM produces structured metadata + structured captions for the seed 1K. Validate quality manually on 50 examples.
5. **Eval harness skeleton** — `eval/queries.json` with 30 queries (start small, expand later), `metrics.py` with unit tests, `runner.py` against a stub retriever.
6. **Baseline CLIP retrieval** — first real eval row.
7. **Filters + reranker** — eval rows.
8. **Scale scraping to 10K images.** Add Europeana, DSpace spiders.
9. **Build labeled pair dataset** — auto-mining + LLM synthesis + 200 hand-labeled hard cases.
10. **LoRA fine-tune CLIP locally** — overnight. Re-embed corpus.
11. **Eval row: tuned CLIP.** Honest comparison.
12. **Query rewriter + synthesizer agents** — eval rows.
13. **MMR diversity reranking** — final eval row.
14. **Frontend.** Only now.
15. **Notebook writeup** — before deployment.
16. **Deploy** — VPS for backend, Vercel for frontend.
17. **Test with 5 real architects.** Gather feedback. Add their queries to eval set.

**Ship checkpoint:** at step 13 you have a defensible research artifact. Steps 14-17 turn it into a real product.

---

## 16. Trust and Provenance (non-negotiable)

This is what separates Visquery from a demo:

- Every image card shows: source URL, photographer, license, retrieved date.
- Every grounded explanation links to the source excerpt it was generated from.
- No image enters the corpus without verified license metadata.
- The synthesizer agent is prompted to never invent — only summarize provided text. Hallucinations are bugs.
- A `/sources` page lists all data sources, license summaries, and counts.

Architects respect attribution. This is also legally necessary.

---

## 17. What to Refuse / Push Back On

- "Let's add user accounts and saved boards" — out of scope for v1.
- "Let's swap FAISS for a hosted vector DB" — only if scale > 100K or for cost reasons.
- "Let's skip fine-tuning and ship base CLIP" — the LoRA fine-tune is the AI engineering centerpiece. Refuse.
- "Let's add image generation" — out of scope. Visquery retrieves; it does not generate.
- "Let's scrape behind paywalls" — never. License-respecting only.
- "Let's skip the eval harness" — **especially** refuse this. Eval is the research backbone.
- "Let's make the UI more 'fun'" — restraint is the design language. Architects respect it.

---

## 18. Definition of Done (v1)

- [ ] Docker Compose brings up backend, worker, Postgres, Redis, Caddy.
- [ ] Frontend deployed to Vercel, talking to backend over HTTPS.
- [ ] At least 10K images ingested, all with verified licenses.
- [ ] All images carry structured metadata mapped to controlled vocabularies.
- [ ] LoRA-fine-tuned CLIP checkpoint deployed (`clip-v0.1.0-arch` or later).
- [ ] At least 150 labeled eval queries with graded relevance.
- [ ] All 7 retrieval configs benchmarked, results in `eval/results/`.
- [ ] Notebook end-to-end with prose discussion and ablations.
- [ ] README explains: what Visquery is, how to run it, eval findings, key ablations.
- [ ] Memory at idle ≤ 4 GB, under load ≤ 5 GB on the VPS.
- [ ] Five architects have used it and given feedback.
- [ ] Feedback endpoint operational; at least 100 ratings collected.

When all checked, the project is real, not a demo.

---

## 19. Stretch Goals (only after section 18)

- Region-of-interest search via SAM2.
- Continuous learning from feedback (use ratings as additional contrastive pairs in next fine-tune).
- Saved-search alerts when new ingestions match an old query.
- Multilingual queries (architecture is global; CLIP supports it weakly out of the box).
- "Find the original photographer" via reverse image search on Wikimedia.

---

## 20. The pitch (for README)

> **Visquery** is a precedent-search tool for architects. Describe what you're looking for in plain language — a curved corner facade, a thick wall that becomes furniture, a courtyard that mediates between public and private — and Visquery returns 30 strong precedents from open architectural archives, each with structured metadata, grounded explanation, and source citation.
>
> Built on a LoRA-fine-tuned CLIP model, hybrid retrieval, and diversity-aware reranking. Independently evaluated against 150 architect-curated queries with graded relevance. All data from CC-licensed and public-domain sources, with full provenance.

That's the project.

---

*End of spec. When in doubt, optimize for the eval table being honest, the licenses being clean, and the architects who use it saying "this found something I didn't know about."*
