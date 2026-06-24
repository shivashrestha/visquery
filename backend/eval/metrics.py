"""Retrieval ranking metrics. Pure functions, no I/O, no LLM.

All take a ranked list of retrieved ids and a set of relevant ids.
Standard IR metrics — match the definitions used by trec_eval / ragas.
"""
from __future__ import annotations

import math


def precision_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    """Fraction of the top-k that are relevant."""
    if k <= 0:
        return 0.0
    topk = ranked[:k]
    if not topk:
        return 0.0
    hits = sum(1 for r in topk if r in relevant)
    return hits / len(topk)


def recall_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    """Fraction of all relevant items found in the top-k."""
    if not relevant:
        return 0.0
    hits = sum(1 for r in ranked[:k] if r in relevant)
    return hits / len(relevant)


def reciprocal_rank(ranked: list[str], relevant: set[str]) -> float:
    """1 / rank of the first relevant hit (0 if none). Mean over queries = MRR."""
    for i, r in enumerate(ranked):
        if r in relevant:
            return 1.0 / (i + 1)
    return 0.0


def hit_rate_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    """1.0 if any relevant item appears in the top-k, else 0.0."""
    return 1.0 if any(r in relevant for r in ranked[:k]) else 0.0


def ndcg_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    """Normalized DCG with binary relevance.

    DCG = sum(rel_i / log2(i+1)); IDCG = best possible ordering.
    """
    def dcg(items: list[str]) -> float:
        return sum(
            (1.0 if item in relevant else 0.0) / math.log2(i + 2)
            for i, item in enumerate(items[:k])
        )

    actual = dcg(ranked)
    ideal_n = min(len(relevant), k)
    if ideal_n == 0:
        return 0.0
    ideal = sum(1.0 / math.log2(i + 2) for i in range(ideal_n))
    return actual / ideal if ideal > 0 else 0.0


def evaluate_query(ranked: list[str], relevant: set[str], ks: list[int]) -> dict[str, float]:
    """All metrics for one query across the requested k cutoffs."""
    out: dict[str, float] = {"mrr": reciprocal_rank(ranked, relevant)}
    for k in ks:
        out[f"precision@{k}"] = precision_at_k(ranked, relevant, k)
        out[f"recall@{k}"] = recall_at_k(ranked, relevant, k)
        out[f"hit@{k}"] = hit_rate_at_k(ranked, relevant, k)
        out[f"ndcg@{k}"] = ndcg_at_k(ranked, relevant, k)
    return out
