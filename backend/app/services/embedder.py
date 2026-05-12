"""CLIP ViT-B/32 embedding service.

Singleton, loaded eagerly at startup via warmup(). Supports base open_clip
weights and a LoRA-merged checkpoint produced by ml/training/lora_clip.py.

CPU inference only — designed for a 6 GB RAM VPS. All inference runs through
a dedicated ThreadPoolExecutor (CLIP_EXECUTOR) to avoid contention with the
default asyncio executor used for I/O.
"""
from __future__ import annotations

import concurrent.futures
import threading
from pathlib import Path
from typing import Union

import numpy as np
import structlog

logger = structlog.get_logger()

_lock = threading.Lock()
_model = None
_preprocess = None
_tokenizer = None

# Dedicated executor so CLIP inference never competes with DB/I/O threads.
# max_workers=2 allows two concurrent inferences without over-subscribing CPU.
CLIP_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="clip")


def _load() -> None:
    """Load model weights exactly once. Thread-safe."""
    global _model, _preprocess, _tokenizer

    with _lock:
        if _model is not None:
            return

        import open_clip
        import torch
        from app.config import get_settings

        settings = get_settings()
        log = logger.bind(checkpoint=settings.clip_checkpoint_path or "base")
        log.info("embedder_loading")

        model, _, preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32",
            pretrained="openai",
        )

        if settings.clip_checkpoint_path:
            path = Path(settings.clip_checkpoint_path)
            if not path.exists():
                raise FileNotFoundError(f"CLIP checkpoint not found: {path}")
            state = torch.load(path, map_location="cpu", weights_only=False)
            state_dict = state.get("model_state_dict", state.get("model", state))
            model.load_state_dict(state_dict, strict=False)
            log.info("embedder_finetuned_loaded")

        model.eval()
        # Keep on CPU — no .to("cuda") here
        _model = model
        _preprocess = preprocess
        _tokenizer = open_clip.get_tokenizer("ViT-B-32")
        log.info("embedder_ready")


def warmup() -> None:
    """Load model weights and run a dummy inference to warm JIT caches."""
    _load()
    import torch

    dummy = _tokenizer(["warmup"])
    with torch.no_grad():
        _model.encode_text(dummy)
    logger.info("embedder_warmup_complete")


def embed_text(text: str) -> np.ndarray:
    """Return L2-normalized CLIP text embedding as float32 (512,)."""
    _load()
    import torch

    tokens = _tokenizer([text])
    with torch.no_grad():
        features = _model.encode_text(tokens)
        features /= features.norm(dim=-1, keepdim=True)
    return features[0].numpy().astype(np.float32)


def embed_texts(texts: list[str]) -> np.ndarray:
    """Batch text embedding. Returns (N, 512) float32."""
    _load()
    import torch

    tokens = _tokenizer(texts)
    with torch.no_grad():
        features = _model.encode_text(tokens)
        features /= features.norm(dim=-1, keepdim=True)
    return features.numpy().astype(np.float32)


def embed_image(pil_image) -> np.ndarray:
    """Return L2-normalized CLIP image embedding as float32 (512,)."""
    _load()
    import torch

    tensor = _preprocess(pil_image).unsqueeze(0)
    with torch.no_grad():
        features = _model.encode_image(tensor)
        features /= features.norm(dim=-1, keepdim=True)
    return features[0].numpy().astype(np.float32)


def embed_image_from_path(path: Union[str, Path]) -> np.ndarray:
    from PIL import Image

    img = Image.open(path).convert("RGB")
    return embed_image(img)
