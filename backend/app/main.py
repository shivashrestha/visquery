"""FastAPI application entry point."""
from __future__ import annotations

import time
import traceback
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, Response, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import APIKeyHeader
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

from app.config import get_settings
from app.routers import admin, images, search, contact, sources, segment, reports, archive

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


async def _keep_warm_loop(settings):
    """Periodically touch models + FAISS so their RAM pages stay resident.

    When the site sits idle the kernel (and WSL2 under Docker Desktop) reclaims
    these pages, so the next request must re-fault every model weight and the
    in-RAM FAISS index back from disk/swap — making the first search and image
    render slow. A cheap dummy inference every few minutes keeps them hot.
    """
    import asyncio
    import numpy as np
    from app.services.embedder import embed_text, CLIP_EXECUTOR
    from app.services.text_embedder import embed_text_query, TEXT_EXECUTOR
    from app.services import reranker
    from app.services.vector_store import get_clip_store, get_text_store

    interval = 180  # seconds — under the kernel's typical idle-reclaim window
    loop = asyncio.get_running_loop()
    while True:
        try:
            await asyncio.sleep(interval)
            await loop.run_in_executor(CLIP_EXECUTOR, embed_text, "warm")
            await loop.run_in_executor(TEXT_EXECUTOR, embed_text_query, "warm")
            await loop.run_in_executor(None, reranker.warmup)
            clip_store = get_clip_store(settings.embedding_version, settings.faiss_data_dir)
            if clip_store.size:
                vec = np.zeros(512, dtype=np.float32)
                await loop.run_in_executor(None, clip_store.search, vec, 1)
            text_store = get_text_store(settings.faiss_data_dir)
            if text_store.size:
                tvec = np.zeros(384, dtype=np.float32)
                await loop.run_in_executor(None, text_store.search, tvec, 1)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("keep_warm_failed", error=str(exc))


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from app.services.embedder import warmup, CLIP_EXECUTOR
    from app.services.text_embedder import warmup as text_warmup, TEXT_EXECUTOR
    from app.services.reranker import warmup as reranker_warmup
    from app.services.vector_store import get_clip_store, get_text_store
    from app.deps import _get_engine
    from app.models.building import Base
    import app.models.source   # noqa: F401 — register Image on Base
    import app.models.segment  # noqa: F401 — register ImageSegment on Base
    import app.models.report   # noqa: F401 — register Report on Base
    import app.models.document # noqa: F401 — register DocSource/DocChunk on Base

    settings = get_settings()
    engine = _get_engine(settings)
    Base.metadata.create_all(bind=engine)

    # Pre-load all models and FAISS indexes to eliminate first-request latency
    get_clip_store(settings.embedding_version, settings.faiss_data_dir)
    get_text_store(settings.faiss_data_dir)

    loop = asyncio.get_running_loop()
    await asyncio.gather(
        loop.run_in_executor(CLIP_EXECUTOR, warmup),
        loop.run_in_executor(TEXT_EXECUTOR, text_warmup),
        loop.run_in_executor(None, reranker_warmup),
    )

    eviction_task = asyncio.create_task(segment.start_eviction_loop())
    keep_warm_task = asyncio.create_task(_keep_warm_loop(settings))
    yield
    eviction_task.cancel()
    keep_warm_task.cancel()


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

    app.add_middleware(GZipMiddleware, minimum_size=1000)

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
    app.include_router(sources.router, prefix="/api")
    app.include_router(segment.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.include_router(archive.router, prefix="/api")

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/metrics")
    async def metrics() -> Response:
        data = generate_latest()
        return Response(content=data, media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
