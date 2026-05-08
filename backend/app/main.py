"""FastAPI application entry point."""
from __future__ import annotations

import time
import uuid

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from app.config import get_settings
from app.routers import admin, feedback, images, search

# ---------------------------------------------------------------------------
# Structured logging setup
# ---------------------------------------------------------------------------

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

SEARCH_REQUESTS = Counter("visquery_search_requests_total", "Total search requests")
SEARCH_LATENCY = Histogram(
    "visquery_search_latency_ms",
    "End-to-end search latency in milliseconds",
    buckets=[50, 100, 200, 500, 1000, 2000, 5000],
)
CORPUS_SIZE = Gauge("visquery_corpus_images_total", "Number of images in corpus")

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Visquery",
        description="Architectural precedent search API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Per-request structured logging context
    @app.middleware("http")
    async def logging_middleware(request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )
        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "request_complete",
            status_code=response.status_code,
            elapsed_ms=elapsed_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response

    app.include_router(search.router)
    app.include_router(images.router)
    app.include_router(feedback.router)
    app.include_router(admin.router)

    from fastapi import Depends, HTTPException
    from app.deps import get_db
    from app.models.building import Building, BuildingRead
    from sqlalchemy.orm import Session

    @app.get("/buildings/{building_id}", response_model=BuildingRead)
    async def get_building(
        building_id: uuid.UUID,
        db: Session = Depends(get_db),
    ) -> Building:
        building = db.query(Building).filter(Building.id == building_id).first()
        if building is None:
            raise HTTPException(status_code=404, detail="Building not found")
        return building

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/metrics")
    async def metrics() -> Response:
        data = generate_latest()
        return Response(content=data, media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
