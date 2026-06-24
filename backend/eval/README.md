# Retrieval Eval Harness

Deterministic retrieval-quality measurement for VisQuery. Runs the **real**
`run_retrieval()` pipeline against a labeled golden set and reports standard IR
metrics. No LLM required — this is the baseline you measure agentic/reranking
changes against.

## Why

Before adding an agentic RAG loop, reranker tweak, or fusion change, you need a
number that says whether it helped. This harness is that number.

## Metrics

| Metric | Meaning |
|--------|---------|
| `precision@k` | fraction of top-k that are relevant |
| `recall@k`    | fraction of all relevant items found in top-k |
| `hit@k`       | 1 if any relevant item in top-k |
| `mrr`         | 1 / rank of first relevant hit (mean over queries) |
| `ndcg@k`      | rank-weighted relevance (binary) |

All defined in [metrics.py](metrics.py), matching trec_eval / ragas conventions.

## Golden set

`datasets/golden.jsonl` — one JSON object per line:

```json
{"query": "brutalist concrete civic building", "relevant_image_ids": ["<uuid>", "<uuid>"], "filters": {}, "notes": ""}
```

Rows with an empty `relevant_image_ids` are skipped (not scored). The seed file
ships with 3 unlabeled rows — replace the ids with real corpus UUIDs.

### Bootstrapping labels fast

```bash
cd backend
python -m eval.build_golden "art deco facade ornament" --k 30
```

Prints candidate `image_id`s + titles + a ready-to-paste JSON row. Eyeball the
list, delete the non-relevant ids, paste into `golden.jsonl`. Aim for ~20–30
labeled queries to start; precision/recall stabilize from there.

## Running outside docker (host machine)

The repo-root `.env` targets container hostnames/paths (`postgres:5432`,
`/data/vectors`) that don't resolve on a host. For local runs, copy the example
and fill host-reachable values:

```bash
cp eval/.env.local.example eval/.env.local   # then edit paths/ports
```

`eval/_bootstrap.py` loads it (override) after the root `.env`. It sets:
`DATABASE_URL` → `localhost:15432` (compose maps postgres there),
`FAISS_DATA_DIR` / `STORAGE_ROOT` → absolute host `storage/` paths.
`.env.local` is gitignored. Inside docker, skip this — everything resolves.

## Run

```bash
cd backend
python -m eval.run_eval
python -m eval.run_eval --k 5 10 20 --json-out eval/reports/$(date +%F).json
```

Prints aggregate (mean over labeled queries) + per-query MRR. `--json-out`
writes a timestamped report so you can diff runs across changes.

## CI gate (later)

Once you have a stable golden set, fail CI when `recall@10` or `ndcg@10`
regresses below a committed threshold. The JSON report is the artifact to
assert against.

## Optional: LLM-judge layer

`judge.py` adds faithfulness/answer-relevance scoring via an LLM judge (ragas-
style) for the *generated answer*, not just retrieval. Separate on purpose —
it's non-deterministic and needs an LLM. Add only after retrieval metrics are
solid.
