"""Load environment before app.config.get_settings() is called.

The backend's Settings reads env_file=".env" relative to CWD. In production
that .env lives at the repo root and is supplied by docker/shell, not under
backend/. The eval scripts run from backend/, so we explicitly find and load
the nearest .env walking up from here. Import this module before importing
app.config.
"""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


def load_env() -> Path | None:
    """Walk up from this file to find the repo-root .env and load it.

    Then load eval/.env.local (if present) with override=True. The root .env
    uses container hostnames/paths (postgres:5432, /data/vectors) that don't
    resolve on a host machine; .env.local supplies host-reachable values for
    local eval runs. Returns the root .env path.
    """
    root: Path | None = None
    for parent in Path(__file__).resolve().parents:
        env = parent / ".env"
        if env.exists():
            load_dotenv(env, override=False)
            root = env
            break

    local = Path(__file__).resolve().parent / ".env.local"
    if local.exists():
        load_dotenv(local, override=True)
    return root


_loaded = load_env()
