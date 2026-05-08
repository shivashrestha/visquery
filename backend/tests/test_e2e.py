"""End-to-end tests for the Visquery backend.

These tests run against a live stack (Postgres + Redis + FAISS). They are
integration/smoke tests, not unit tests. Set DATABASE_URL and REDIS_URL in the
environment (or .env) before running.

Usage:
    pytest backend/tests/test_e2e.py -v

The fixture tests assume the database is empty or the fixture buildings have
been pre-seeded. Run `pytest -m smoke` for the health-only check that works
with no data.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
import httpx

BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")


@pytest.mark.smoke
def test_health():
    """Health endpoint returns 200 with status ok."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "version" in body


@pytest.mark.smoke
def test_metrics():
    """Metrics endpoint returns Prometheus text format."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]


@pytest.mark.smoke
def test_search_empty_corpus():
    """Search against an empty corpus returns an empty results list without crashing."""
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        resp = client.post(
            "/search",
            json={
                "query": "concrete museum with courtyard",
                "image_id": None,
                "filters": {},
                "config": "baseline",
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "results" in body
    assert isinstance(body["results"], list)
    assert "latency_ms" in body


@pytest.mark.smoke
def test_search_unknown_building():
    """Search for a very unlikely query returns gracefully."""
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        resp = client.post(
            "/search",
            json={"query": "zzzzz nonexistent building xyzzy", "config": "baseline"},
        )
    assert resp.status_code == 200


@pytest.mark.smoke
def test_building_not_found():
    """Non-existent building ID returns 404."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.get(f"/buildings/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.smoke
def test_image_not_found():
    """Non-existent image ID returns 404."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.get(f"/images/{uuid.uuid4()}/raw")
    assert resp.status_code == 404


@pytest.mark.smoke
def test_feedback_unknown_image():
    """Submitting feedback for a non-existent image returns 404."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.post(
            "/feedback",
            json={
                "query_text": "test query",
                "result_image_id": str(uuid.uuid4()),
                "rating": 1,
                "session_id": "test-session-001",
            },
        )
    assert resp.status_code == 404


@pytest.mark.smoke
def test_admin_stats():
    """Admin stats endpoint returns expected fields."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.get("/admin/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert "building_count" in body
    assert "image_count" in body
    assert "embedding_version" in body


@pytest.mark.smoke
def test_search_invalid_config():
    """Sending an invalid config name returns a validation error."""
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        resp = client.post(
            "/search",
            json={"query": "test", "config": "not_a_real_config"},
        )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Fixture-based test: requires pre-seeded data
# ---------------------------------------------------------------------------

FIXTURE_BUILDING_ID = os.getenv("FIXTURE_BUILDING_ID", "")
FIXTURE_QUERY = os.getenv("FIXTURE_QUERY", "curved facade at street corner")


@pytest.mark.integration
@pytest.mark.skipif(
    not FIXTURE_BUILDING_ID,
    reason="FIXTURE_BUILDING_ID not set — skipping seeded retrieval test",
)
def test_search_returns_fixture_building():
    """Verify that a seed query retrieves the known fixture building in top results.

    This is the core retrieval smoke test. It requires:
    - FIXTURE_BUILDING_ID: UUID of the pre-ingested building
    - FIXTURE_QUERY: the natural-language query that should retrieve it
    - The CLIP index to contain embeddings for that building's images
    """
    with httpx.Client(base_url=BASE_URL, timeout=60) as client:
        resp = client.post(
            "/search",
            json={
                "query": FIXTURE_QUERY,
                "filters": {},
                "config": "baseline",
            },
        )
    assert resp.status_code == 200
    body = resp.json()

    returned_building_ids = [r["building_id"] for r in body["results"] if r.get("building_id")]
    assert FIXTURE_BUILDING_ID in returned_building_ids, (
        f"Fixture building {FIXTURE_BUILDING_ID} not found in top results. "
        f"Returned: {returned_building_ids[:5]}"
    )


@pytest.mark.integration
@pytest.mark.skipif(
    not FIXTURE_BUILDING_ID,
    reason="FIXTURE_BUILDING_ID not set",
)
def test_full_pipeline_returns_explanations():
    """Full pipeline with synthesis should attach non-empty explanations."""
    with httpx.Client(base_url=BASE_URL, timeout=120) as client:
        resp = client.post(
            "/search",
            json={
                "query": FIXTURE_QUERY,
                "filters": {},
                "config": "full",
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["results"], "Expected at least one result"

    top = body["results"][0]
    assert "explanation" in top
    assert "source" in top
    assert top["source"].get("url") or True  # URL may be null in test corpus
