"""Alembic environment — resolves the DB URL from app settings (.env)."""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Resolve database URL from app settings unless explicitly set in alembic.ini
if not config.get_main_option("sqlalchemy.url"):
    from app.config import get_settings
    config.set_main_option("sqlalchemy.url", get_settings().database_url)

# Register all models on Base for autogenerate support
from app.models.building import Base  # noqa: E402
import app.models.source   # noqa: F401, E402
import app.models.segment  # noqa: F401, E402
import app.models.document # noqa: F401, E402

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
