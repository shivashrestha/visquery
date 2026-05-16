"""FastAPI application entry point."""
from __future__ import annotations

import time
import traceback
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from app.config import get_settings
from app.routers import admin, images, search, contact

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

SEARCH_REQUESTS = Counter("visquery_search_requests_total", "Total search requests")
SEARCH_LATENCY = Histogram(
    "visquery_search_latency_ms",
    "End-to-end search latency in milliseconds",
    buckets=[50, 100, 200, 500, 1000, 2000, 5000],
)
CORPUS_SIZE = Gauge("visquery_corpus_images_total", "Number of images in corpus")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from app.services.embedder import warmup, CLIP_EXECUTOR
    from app.deps import _get_engine
    from app.models.building import Base
    import app.models.source  # noqa: F401 — register Image on Base

    settings = get_settings()
    engine = _get_engine(settings)
    Base.metadata.create_all(bind=engine)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(CLIP_EXECUTOR, warmup)
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Visquery",
        description="Architectural precedent search API",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )

    origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            logger.error(
                "request_unhandled_exception",
                error=str(exc),
                traceback=traceback.format_exc(),
                elapsed_ms=elapsed_ms,
            )
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
                headers={"X-Request-ID": request_id},
            )
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "request_complete",
            status_code=response.status_code,
            elapsed_ms=elapsed_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response

    _admin_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)

    def _verify_admin(
        key: str | None = Security(_admin_key_header),
    ) -> None:
        if not settings.admin_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Admin access not configured.",
            )
        if key != settings.admin_secret:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing admin key.",
            )

    app.include_router(search.router, prefix="/api")
    app.include_router(images.router, prefix="/api")
    app.include_router(admin.router, prefix="/api", dependencies=[Depends(_verify_admin)])
    app.include_router(contact.router, prefix="/api")

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/metrics")
    async def metrics() -> Response:
        data = generate_latest()
        return Response(content=data, media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
