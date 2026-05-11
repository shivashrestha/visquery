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

    # Database — set in .env
    database_url: str = ""

    # Redis / RQ — set in .env
    redis_url: str = ""

    # Object storage (S3-compatible) — set in .env
    object_storage_url: str = ""
    object_storage_bucket: str = ""
    object_storage_key_id: str = ""
    object_storage_application_key: str = ""

    # Model checkpoints
    # Empty string → load base open_clip ViT-B/32 weights from HuggingFace Hub
    clip_checkpoint_path: str = ""
    style_checkpoint_path: str = ""

    # Reranker
    reranker_model: str = "BAAI/bge-reranker-base"

    # LLM (Ollama cloud) — set in .env
    ollama_base_url: str = ""
    ollama_vlm_model: str = ""   # vision model for image captioning
    ollama_model: str = ""       # text LLM fallback (used if rag_llm_model not set)
    rag_llm_model: str = ""      # text LLM for router/rewriter/synthesizer
    ollama_api_key: str = ""

    # Storage paths — defaults match Docker volume mount at /data
    faiss_data_dir: str = "/data/vectors"
    storage_root: str = "/data"
    embedding_version: str = "2"

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
