"""Style feature extraction using Gram matrices from a frozen VGG-16.

Returns a normalized style vector that captures texture and material character
independently of semantic content. Used as a secondary retrieval signal fused
with CLIP scores via RRF.

Singleton + lazy load pattern. CPU only.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Union

import numpy as np
import structlog

logger = structlog.get_logger()

_lock = threading.Lock()
_model = None
_feature_layers = None
_transform = None

# VGG-16 layer indices whose feature maps feed Gram computation.
# Chosen to cover low-level texture (relu1_2, relu2_2) and mid-level
# material structure (relu3_3, relu4_3).
_GRAM_LAYER_INDICES = [3, 8, 15, 22]
_STYLE_DIM = 2048  # concatenated and PCA-projected; actual dim set after first run


def _load() -> None:
    global _model, _feature_layers, _transform

    with _lock:
        if _model is not None:
            return

        import torch
        import torchvision.models as models
        import torchvision.transforms as T

        log = logger.bind(service="style")
        log.info("style_service_loading")

        vgg = models.vgg16(weights=models.VGG16_Weights.IMAGENET1K_V1)
        vgg.eval()

        # Keep only the feature extractor; discard classifier layers.
        features = vgg.features
        for param in features.parameters():
            param.requires_grad_(False)

        _feature_layers = features
        _model = vgg

        _transform = T.Compose([
            T.Resize(256),
            T.CenterCrop(224),
            T.ToTensor(),
            T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        log.info("style_service_ready")


def _gram_matrix(feature_map: "torch.Tensor") -> "torch.Tensor":
    """Compute normalized Gram matrix for a single (C, H, W) feature map."""
    import torch

    c, h, w = feature_map.shape
    flat = feature_map.view(c, h * w)
    gram = torch.mm(flat, flat.t()) / (c * h * w)
    return gram


def embed_image(pil_image) -> np.ndarray:
    """Return a normalized style vector for a PIL image."""
    _load()
    import torch

    tensor = _transform(pil_image).unsqueeze(0)

    grams: list[np.ndarray] = []
    x = tensor
    layer_idx = 0
    with torch.no_grad():
        for i, layer in enumerate(_feature_layers):
            x = layer(x)
            if i in _GRAM_LAYER_INDICES:
                g = _gram_matrix(x[0])
                # Flatten upper triangle (including diagonal) to a 1-D vector
                upper = g[torch.triu(torch.ones_like(g, dtype=torch.bool))].numpy()
                grams.append(upper)

    vec = np.concatenate(grams).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec


def embed_image_from_path(path: Union[str, Path]) -> np.ndarray:
    from PIL import Image

    img = Image.open(path).convert("RGB")
    return embed_image(img)
