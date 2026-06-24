"""VisQuery retrieval evaluation harness.

Deterministic retrieval metrics (precision/recall/MRR/nDCG) over a labeled
golden set. No LLM required for the core harness — runs against the real
retrieval pipeline so it measures what production actually returns.
"""
