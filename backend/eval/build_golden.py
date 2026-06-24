"""Helper to build/label the golden set.

Runs retrieval for a query and prints candidate image_ids + titles so you can
eyeball which are relevant and paste their ids into golden.jsonl. This is the
fast way to bootstrap a labeled set without a UI.

Usage (from backend/):
    python -m eval.build_golden "brutalist concrete civic building"
    python -m eval.build_golden "art deco facade" --k 30
"""
from __future__ import annotations

import argparse
import asyncio
import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from eval import _bootstrap  # noqa: F401  loads root .env before app.config
from app.config import get_settings
from app.services.retrieval import RetrievalConfig, run_retrieval


async def main(query: str, k: int) -> None:
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    try:
        res = await run_retrieval(
            query=query, image_id=None, filters={},
            config=RetrievalConfig(top_k_final=k), db=db, settings=settings,
        )
    finally:
        db.close()

    print(f"\nquery: {query}\ncandidates (mark the relevant ones):\n")
    relevant_guess: list[str] = []
    for i, r in enumerate(res["results"]):
        m = r["metadata"]
        name = m.get("name") or (m.get("description") or "")[:50] or "?"
        print(f"  {i:>2}. {r['image_id']}  score={r['score']:.3f}  {name}")
        relevant_guess.append(r["image_id"])

    print("\nPaste into eval/datasets/golden.jsonl (then prune to truly relevant):")
    print(json.dumps({
        "query": query,
        "relevant_image_ids": relevant_guess,
        "filters": {},
        "notes": "",
    }, ensure_ascii=False))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("--k", type=int, default=20)
    args = ap.parse_args()
    asyncio.run(main(args.query, args.k))
