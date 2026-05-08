"""FastAPI dependency injection helpers."""
from __future__ import annotations

from typing import Generator

import structlog
from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings

logger = structlog.get_logger()

_engine = None
_SessionLocal = None


def _get_engine(settings: Settings):
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def get_db(settings: Settings = Depends(get_settings)) -> Generator[Session, None, None]:
    _get_engine(settings)
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
