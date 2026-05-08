from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql://visquery:changeme@localhost:5432/visquery"

    # Redis / RQ
    redis_url: str = "redis://localhost:6379/0"

    # Object storage (S3-compatible)
    object_storage_url: str = "https://s3.us-east-005.backblazeb2.com"
    object_storage_bucket: str = "visquery-images"
    object_storage_key_id: str = ""
    object_storage_application_key: str = ""

    # Model checkpoints
    # Empty string → load base open_clip ViT-B/32 weights from HuggingFace Hub
    clip_checkpoint_path: str = ""
    style_checkpoint_path: str = ""

    # Reranker
    reranker_model: str = "BAAI/bge-reranker-base"

    # LLM
    llm_provider: Literal["anthropic", "ollama"] = "ollama"
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"

    # FAISS
    faiss_data_dir: str = "/data/faiss"
    embedding_version: str = "base"

    # Retrieval defaults
    mmr_lambda: float = 0.7
    fusion_method: Literal["clip_only", "weighted", "rrf"] = "rrf"
    top_k_retrieve: int = 100
    top_k_final: int = 30

    # Logging
    log_level: str = "INFO"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
