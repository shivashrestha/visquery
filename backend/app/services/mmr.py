"""Maximum Marginal Relevance (MMR) diversity reranking.

MMR selects items that are both relevant to the query and diverse relative to
already-selected items. The trade-off is controlled by lambda (0 = pure
diversity, 1 = pure relevance).

Reference: Carbonell & Goldstein (1998).
"""
from __future__ import annotations

import numpy as np


def mmr(
    query_embedding: np.ndarray,
    candidate_embeddings: np.ndarray,
    candidate_ids: list[str],
    scores: list[float],
    top_k: int,
    lambda_: float = 0.7,
) -> list[tuple[str, float]]:
    """Return up to top_k (id, mmr_score) pairs.

    Parameters
    ----------
    query_embedding:
        L2-normalized query vector (dim,).
    candidate_embeddings:
        L2-normalized candidate vectors (N, dim). Must be aligned with
        candidate_ids and scores.
    candidate_ids:
        Image UUID strings for each candidate row.
    scores:
        Relevance scores (e.g. CLIP cosine similarities) for each candidate.
    top_k:
        Maximum number of results to return.
    lambda_:
        Weight on relevance (1 - lambda_ on diversity penalty).
    """
    if len(candidate_ids) == 0:
        return []

    n = len(candidate_ids)
    top_k = min(top_k, n)

    # Similarity matrix between all candidates (N, N) via dot product on
    # L2-normalized vectors == cosine similarity.
    sim_matrix = candidate_embeddings @ candidate_embeddings.T  # (N, N)

    relevance = np.array(scores, dtype=np.float32)
    remaining = list(range(n))
    selected: list[int] = []

    while len(selected) < top_k and remaining:
        if not selected:
            # First pick: highest relevance
            best_idx = int(np.argmax([relevance[i] for i in remaining]))
        else:
            # MMR score: lambda * rel(i) - (1-lambda) * max_{j in S} sim(i, j)
            best_mmr = -np.inf
            best_idx = remaining[0]
            for i in remaining:
                max_sim_to_selected = max(float(sim_matrix[i, j]) for j in selected)
                mmr_score = lambda_ * relevance[i] - (1.0 - lambda_) * max_sim_to_selected
                if mmr_score > best_mmr:
                    best_mmr = mmr_score
                    best_idx = i

        selected.append(best_idx)
        remaining.remove(best_idx)

    return [(candidate_ids[i], float(relevance[i])) for i in selected]
