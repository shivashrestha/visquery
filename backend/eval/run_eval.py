"""Run the retrieval eval harness against the real pipeline.

Usage (from backend/):
    python -m eval.run_eval
    python -m eval.run_eval --dataset eval/datasets/golden.jsonl --k 5 10 20
    python -m eval.run_eval --json-out eval/reports/run.json

Loads a labeled golden set, runs run_retrieval() for each query, computes
standard IR metrics per query, aggregates the mean, prints a table, and
optionally writes a timestamped JSON report. No LLM involved — this measures
retrieval quality deterministically.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from eval import _bootstrap  # noqa: F401  loads root .env before app.config
from app.config import get_settings
from app.services.retrieval import RetrievalConfig, run_retrieval

from eval.metrics import evaluate_query

DEFAULT_DATASET = Path(__file__).parent / "datasets" / "golden.jsonl"
DEFAULT_KS = [5, 10, 20]


def load_golden(path: Path) -> list[dict]:
    rows: list[dict] = []
    for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{ln} bad JSON: {exc}") from exc
        if not row.get("query"):
            raise ValueError(f"{path}:{ln} missing 'query'")
        rows.append(row)
    return rows


async def _run_one(row: dict, config: RetrievalConfig, db, settings) -> list[str]:
    res = await run_retrieval(
        query=row["query"],
        image_id=None,
        filters=row.get("filters") or {},
        config=config,
        db=db,
        settings=settings,
    )
    return [r["image_id"] for r in res["results"]]


async def run(dataset: Path, ks: list[int]) -> dict:
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    golden = load_golden(dataset)
    labeled = [r for r in golden if r.get("relevant_image_ids")]
    unlabeled = len(golden) - len(labeled)

    config = RetrievalConfig(top_k_final=max(ks))
    per_query: list[dict] = []

    db = SessionLocal()
    try:
        for row in labeled:
            ranked = await _run_one(row, config, db, settings)
            relevant = set(row["relevant_image_ids"])
            scores = evaluate_query(ranked, relevant, ks)
            per_query.append({
                "query": row["query"],
                "n_relevant": len(relevant),
                "n_retrieved": len(ranked),
                "metrics": scores,
            })
    finally:
        db.close()

    # Aggregate: mean of each metric across labeled queries
    aggregate: dict[str, float] = {}
    if per_query:
        keys = per_query[0]["metrics"].keys()
        for key in keys:
            aggregate[key] = statistics.mean(q["metrics"][key] for q in per_query)

    return {
        "dataset": str(dataset),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ks": ks,
        "n_labeled": len(labeled),
        "n_unlabeled_skipped": unlabeled,
        "aggregate": aggregate,
        "per_query": per_query,
    }


def print_report(report: dict) -> None:
    print(f"\nVisQuery retrieval eval — {report['timestamp']}")
    print(f"dataset: {report['dataset']}")
    print(f"labeled queries: {report['n_labeled']}  "
          f"(skipped unlabeled: {report['n_unlabeled_skipped']})")

    if report["n_unlabeled_skipped"]:
        print("  ! Rows with empty relevant_image_ids were skipped. "
              "Label them in the golden set to score them.")

    if not report["aggregate"]:
        print("\nNo labeled queries to score. Add relevant_image_ids to the "
              "golden set (see eval/README.md), then re-run.")
        return

    print("\n=== aggregate (mean over labeled queries) ===")
    for metric, value in report["aggregate"].items():
        print(f"  {metric:<14} {value:.4f}")

    print("\n=== per query ===")
    for q in report["per_query"]:
        m = q["metrics"]
        print(f"  [{m.get('mrr', 0):.3f} mrr] {q['query'][:60]}  "
              f"(rel={q['n_relevant']}, got={q['n_retrieved']})")


def main() -> int:
    ap = argparse.ArgumentParser(description="VisQuery retrieval eval harness")
    ap.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    ap.add_argument("--k", type=int, nargs="+", default=DEFAULT_KS, dest="ks")
    ap.add_argument("--json-out", type=Path, default=None)
    args = ap.parse_args()

    if not args.dataset.exists():
        print(f"dataset not found: {args.dataset}", file=sys.stderr)
        return 2

    report = asyncio.run(run(args.dataset, sorted(args.ks)))
    print_report(report)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nwrote {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
