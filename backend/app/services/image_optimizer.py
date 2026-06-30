"""In-memory image optimization for pre-embedding processing."""
from __future__ import annotations

import io
from PIL import Image as PILImage

MAX_EMBED_BYTES = 2 * 1024 * 1024  # 2 MB threshold
MAX_DIMENSION = 1024               # max side length for CLIP
MIN_DIMENSION = 500
MIN_QUALITY = 40


def make_thumbnail(image_bytes: bytes, width: int, quality: int = 75) -> bytes:
    """Return WebP bytes resized to `width` px (aspect kept). Width clamped 16..2048.

    Used to serve small card/grid thumbnails instead of multi-MB originals —
    cuts a ~2.4MB original to ~30-80KB so pages with many images load fast.
    """
    width = max(16, min(int(width), 2048))
    pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = pil.size
    if w > width:
        scale = width / w
        pil = pil.resize((width, max(1, round(h * scale))), PILImage.LANCZOS)
    buf = io.BytesIO()
    pil.save(buf, "WEBP", quality=max(1, min(int(quality), 100)), method=4)
    return buf.getvalue()


def optimize_for_embedding(image_bytes: bytes) -> PILImage.Image:
    """Return an RGB PIL Image optimized for CLIP embedding.

    Large images are resized and/or quality-reduced in memory.
    The input bytes are never written to disk.
    """
    pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = pil.size

    # Resize if any dimension exceeds the CLIP-friendly cap
    if max(w, h) > MAX_DIMENSION:
        scale = MAX_DIMENSION / max(w, h)
        pil = pil.resize((int(w * scale), int(h * scale)), PILImage.LANCZOS)

    # If already small enough, return as-is
    if len(image_bytes) <= MAX_EMBED_BYTES:
        return pil

    # Iteratively compress until under threshold
    quality = 60
    while True:
        buf = io.BytesIO()
        pil.save(buf, "JPEG", optimize=True, quality=quality)
        if buf.tell() <= MAX_EMBED_BYTES:
            buf.seek(0)
            return PILImage.open(buf).convert("RGB")

        if quality > MIN_QUALITY:
            quality -= 5
        else:
            w2, h2 = pil.size
            if min(w2, h2) < MIN_DIMENSION:
                buf.seek(0)
                return PILImage.open(buf).convert("RGB")
            pil = pil.resize((w2 // 2, h2 // 2), PILImage.LANCZOS)
            quality = 60
