"""Optional LLM-judge layer — scores a *generated answer*, not retrieval.

Ragas-style faithfulness + answer-relevance via the project's existing Ollama
client. Non-deterministic; keep separate from the deterministic retrieval
metrics in run_eval.py. Use only once retrieval metrics are solid and you have
a generation step (e.g. the agentic RAG synthesizer) to evaluate.

Usage:
    from eval.judge import judge_answer
    score = judge_answer(query, answer, contexts)
"""
from __future__ import annotations

import json

from app.services import llm as llm_client

_FAITHFULNESS_SYS = (
    "You are a strict evaluator. Given a QUESTION, an ANSWER, and the CONTEXT "
    "passages the answer was supposed to use, judge two things:\n"
    "1. faithfulness: is every claim in the answer supported by the context? "
    "(no hallucination)\n"
    "2. answer_relevance: does the answer actually address the question?\n"
    'Return ONLY JSON: {"faithfulness": 0.0-1.0, "answer_relevance": 0.0-1.0, '
    '"reason": "one sentence"}'
)


def judge_answer(query: str, answer: str, contexts: list[str]) -> dict:
    """Return {faithfulness, answer_relevance, reason}. Floats in [0,1]."""
    ctx = "\n---\n".join(contexts)
    user = f"QUESTION:\n{query}\n\nANSWER:\n{answer}\n\nCONTEXT:\n{ctx}"
    try:
        result = llm_client.complete_json(
            system=_FAITHFULNESS_SYS, user=user, temperature=0.0
        )
        return {
            "faithfulness": float(result.get("faithfulness", 0.0)),
            "answer_relevance": float(result.get("answer_relevance", 0.0)),
            "reason": result.get("reason", ""),
        }
    except Exception as exc:  # judge failures must not crash an eval run
        return {"faithfulness": 0.0, "answer_relevance": 0.0,
                "reason": f"judge_error: {exc}"}


if __name__ == "__main__":
    demo = judge_answer(
        "What style is the Barbican?",
        "The Barbican is a brutalist housing estate in London.",
        ["The Barbican Estate is a residential complex in London built in the "
         "brutalist style, completed in 1976."],
    )
    print(json.dumps(demo, indent=2))
