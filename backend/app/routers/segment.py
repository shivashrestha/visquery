"""Image segmentation — FastSAM-s (class-agnostic) or FastSAM+CLIP hybrid (architectural labels)."""
from __future__ import annotations

import base64
import colorsys
import io
import logging
import threading
import time
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from PIL import Image as PILImage, ImageDraw, ImageFont
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.deps import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["segment"])

# ── Paths ─────────────────────────────────────────────────────────────────────
FASTSAM_MODEL_PATH   = Path(__file__).parent.parent.parent / "fastsam-s" / "fastsam_s.tflite"

# ── FastSAM constants ─────────────────────────────────────────────────────────
INFER_SIZE        = 640
CONF_THRESHOLD    = 0.20
NMS_IOU_THRESHOLD = 0.45
MAX_SEGMENTS      = 20
ANNOTATED_MAX_DIM = 1200
MASK_ALPHA        = 140
BORDER_WIDTH      = 3

# ── SegFormer constants ───────────────────────────────────────────────────────
SEG_INPUT_SIZE          = 512    # 512 → 128×128 output; 4× faster on CPU, adequate for display
MAX_INSTANCES_PER_CLASS = 8
MAX_TOTAL_INSTANCES     = 20
MIN_INSTANCE_AREA       = 0.0005  # 0.05% of seg-map pixels

# ADE20K architectural class subset
ARCH_CLASS_NAMES: dict[int, str] = {
    0: "Wall",       1: "Building",   3: "Floor",      5: "Ceiling",
    8: "Window",    14: "Door",       25: "House",      32: "Fence",
    38: "Railing",  40: "Pedestal",   42: "Column",    48: "Skyscraper",
    49: "Fireplace", 53: "Stairs",    59: "Staircase",  61: "Bridge",
    84: "Tower",    86: "Awning",     95: "Handrail",   96: "Escalator",
    104: "Fountain", 106: "Canopy",  121: "Step",      132: "Sculpture",
}

ARCH_CLASS_COLORS: dict[int, tuple[int, int, int]] = {
    0:  (180, 180, 180),   1:  ( 70, 130, 180),   3:  (210, 180, 140),
    5:  (240, 240, 200),   8:  (100, 180, 240),   14: (160,  82,  45),
    25: ( 70, 130, 180),  32:  (105, 105, 105),   38: (255, 165,   0),
    40: (176, 196, 222),  42:  (147, 112, 219),   48: ( 50, 100, 200),
    49: (255,  69,   0),  53:  (205, 133,  63),   59: (205, 133,  63),
    61: (119, 136, 153),  84:  (100, 149, 237),   86: (152, 251, 152),
    95: (255, 215,   0),  96:  (205, 133,  63),  104: (  0, 191, 255),
    106:(144, 238, 144), 121:  (205, 133,  63),  132: (218, 165,  32),
}

# ── CLIP architectural label vocabulary ───────────────────────────────────────
# (prompt_suffix,  display_name,  rgb_color)  — display_name=None → non-arch, filter out
_CLIP_VOCAB: list[tuple[str, str | None, tuple[int, int, int]]] = [
    ("a window or window frame",     "Window",    (100, 180, 240)),
    ("a door or doorway",            "Door",      (160,  82,  45)),
    ("a balcony",                    "Balcony",   (152, 251, 152)),
    ("a rooftop or roof surface",    "Roof",      (119, 136, 153)),
    ("an exterior building wall",    "Wall",      (180, 180, 180)),
    ("a railing or balustrade",      "Railing",   (255, 165,   0)),
    ("stairs or stone steps",        "Stairs",    (205, 133,  63)),
    ("a column or architectural pillar", "Column",(147, 112, 219)),
    ("a fence or iron gate",         "Fence",     (105, 105, 105)),
    ("an arch or archway",           "Arch",      (200, 150, 100)),
    ("a chimney",                    "Chimney",   (160, 120,  80)),
    ("a tower or spire",             "Tower",     (100, 149, 237)),
    ("a fountain or water feature",  "Fountain",  (  0, 191, 255)),
    ("a sculpture or monument",      "Sculpture", (218, 165,  32)),
    ("a skylight",                   "Skylight",  (135, 206, 250)),
    ("a decorative cornice or molding","Cornice", (200, 170, 130)),
    # Non-architectural — predict but filter
    ("sky or clouds",                None,        (0, 0, 0)),
    ("trees or dense vegetation",    None,        (0, 0, 0)),
    ("road or paved ground",         None,        (0, 0, 0)),
    ("a person or people",           None,        (0, 0, 0)),
    ("a car or vehicle",             None,        (0, 0, 0)),
]

_CLIP_PROMPTS  = [f"a photo of {s}"   for s, _, _  in _CLIP_VOCAB]
_CLIP_DISPLAYS = [d                    for _, d, _  in _CLIP_VOCAB]
_CLIP_COLORS   = [c                    for _, _, c  in _CLIP_VOCAB]
CLIP_MIN_CONF  = 0.20        # min softmax probability; below this → keep region, no label
CLIP_LOGIT_SCALE = 100.0     # CLIP temperature — softmax on raw cosines is near-uniform

# Golden-angle palette for class-agnostic FastSAM
_PALETTE: list[tuple[int, int, int]] = []
for _i in range(MAX_SEGMENTS):
    _h = (_i * 137.508) % 360
    _r, _g, _b = colorsys.hsv_to_rgb(_h / 360, 0.80, 0.95)
    _PALETTE.append((int(_r * 255), int(_g * 255), int(_b * 255)))


# ── Lazy model singletons ─────────────────────────────────────────────────────
_fastsam_interp: Any = None
_segformer_model: Any = None
_segformer_processor: Any = None
_clip_model: Any = None
_clip_preprocess: Any = None
_clip_text_feats: Any = None

_segformer_last_used: float = 0.0
_SEGFORMER_TTL_S: float = 600.0  # unload after 10 min idle to recover ~400MB RAM

# tflite Interpreter is NOT thread-safe — concurrent invoke() corrupts internal
# buffers ("There is at least 1 reference to internal data..."). Serialize all
# FastSAM inference; concurrent requests queue instead of crashing.
_fastsam_lock = threading.Lock()


def _get_fastsam() -> Any:
    global _fastsam_interp
    if _fastsam_interp is not None:
        return _fastsam_interp
    if not FASTSAM_MODEL_PATH.exists():
        raise HTTPException(503, detail=f"FastSAM model not found at {FASTSAM_MODEL_PATH}")
    try:
        from ai_edge_litert.interpreter import Interpreter  # type: ignore
        interp = Interpreter(str(FASTSAM_MODEL_PATH))
        interp.allocate_tensors()
        _fastsam_interp = interp
        logger.info("FastSAM-s loaded from %s", FASTSAM_MODEL_PATH)
        return _fastsam_interp
    except ImportError:
        raise HTTPException(503, detail="ai-edge-litert not installed")
    except Exception as exc:
        raise HTTPException(503, detail=f"FastSAM load failed: {exc}")

def _evict_segformer_if_idle() -> None:
    global _segformer_model, _segformer_processor
    if _segformer_model is None:
        return
    idle = time.monotonic() - _segformer_last_used
    if idle >= _SEGFORMER_TTL_S:
        _segformer_model = None
        _segformer_processor = None
        logger.info("SegFormer evicted after %.0fs idle — RAM freed", idle)


async def start_eviction_loop() -> None:
    """Background task: evict idle SegFormer model every 2 min to recover RAM."""
    import asyncio
    while True:
        await asyncio.sleep(120)
        _evict_segformer_if_idle()


def _get_clip() -> tuple[Any, Any, Any]:
    """Lazy-load CLIP ViT-B/32 (already baked in Docker image).

    The -quickgelu variant matches the activation the openai checkpoint was
    trained with; plain ViT-B-32 in open_clip>=2.24 silently degrades it.
    """
    global _clip_model, _clip_preprocess, _clip_text_feats
    if _clip_model is not None:
        return _clip_model, _clip_preprocess, _clip_text_feats
    try:
        import open_clip  # type: ignore
        import torch
        _clip_model, _, _clip_preprocess = open_clip.create_model_and_transforms(
            "ViT-B-32-quickgelu", pretrained="openai"
        )
        _clip_model.eval()
        tokenizer = open_clip.get_tokenizer("ViT-B-32-quickgelu")
        with torch.inference_mode():
            tokens = tokenizer(_CLIP_PROMPTS)
            feats = _clip_model.encode_text(tokens)
            _clip_text_feats = feats / feats.norm(dim=-1, keepdim=True)
        logger.info("CLIP classifier ready — %d architectural labels", sum(d is not None for _, d, _ in _CLIP_VOCAB))
        return _clip_model, _clip_preprocess, _clip_text_feats
    except Exception as exc:
        raise HTTPException(503, detail=f"CLIP load failed: {exc}")


# ── Shared helpers ────────────────────────────────────────────────────────────
def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -88, 88)))


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float) -> list[int]:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1).clip(0) * (y2 - y1).clip(0)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = order[0]; keep.append(int(i))
        if order.size == 1: break
        rest = order[1:]
        ix1 = np.maximum(x1[i], x1[rest]); iy1 = np.maximum(y1[i], y1[rest])
        ix2 = np.minimum(x2[i], x2[rest]); iy2 = np.minimum(y2[i], y2[rest])
        inter = (ix2 - ix1).clip(0) * (iy2 - iy1).clip(0)
        union = areas[i] + areas[rest] - inter
        iou   = np.where(union > 0, inter / union, 0.0)
        order = rest[iou < iou_thresh]
    return keep


def _encode_pil(img: PILImage.Image, quality: int = 85) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _make_crop(img_arr: np.ndarray, mask_bool: np.ndarray,
               x1: int, y1: int, x2: int, y2: int) -> tuple[PILImage.Image, str]:
    """Return (crop_pil, crop_data_url). crop_pil is uncompressed for CLIP."""
    crop  = img_arr[y1:y2, x1:x2].astype(np.float32)
    m     = mask_bool[y1:y2, x1:x2][..., None]
    lit   = np.where(m, crop, crop * 0.22)
    pil   = PILImage.fromarray(np.clip(lit, 0, 255).astype(np.uint8))
    return pil, _encode_pil(pil, quality=84)


def _draw_badge(draw: ImageDraw.ImageDraw, label: str,
                bx: int, by: int, size: int,
                color: tuple[int, int, int]) -> None:
    r, g, b = color
    draw.ellipse([bx, by, bx + size, by + size], fill=(r, g, b, 230))
    try:
        font = ImageFont.truetype("arial.ttf", size=max(9, size - 5))
    except Exception:
        font = ImageFont.load_default()
    bb = font.getbbox(label)
    tx = bx + (size - (bb[2] - bb[0])) // 2
    ty = by + (size - (bb[3] - bb[1])) // 2
    draw.text((tx, ty), label, fill=(255, 255, 255, 255), font=font)


# ── Pydantic models ───────────────────────────────────────────────────────────
class SegmentObject(BaseModel):
    id: int
    confidence: float
    bbox: list[float]      # [x1, y1, x2, y2] normalised 0–1
    area_ratio: float
    color: list[int]       # [R, G, B]
    class_name: str | None # None = class-agnostic (FastSAM)
    crop_data_url: str


class SegmentResponse(BaseModel):
    segments: list[SegmentObject]
    annotated_data_url: str
    image_width: int
    image_height: int
    model_used: str        # "fastsam" | "segformer" | "hybrid"


# ── FastSAM region extraction (shared by fastsam + hybrid) ───────────────────
def _fastsam_regions(raw: bytes) -> tuple[PILImage.Image, list[dict]]:
    """Run FastSAM inference; return (original PIL image, list of region dicts).
    Each dict: conf, x1n/y1n/x2n/y2n, area_ratio, crop_pil, crop_data_url, mask_pil_160
    """
    pil_img = PILImage.open(io.BytesIO(raw)).convert("RGB")
    img_w, img_h = pil_img.size

    resized    = pil_img.resize((INFER_SIZE, INFER_SIZE), PILImage.LANCZOS)
    inp        = np.array(resized, dtype=np.float32)[np.newaxis] / 255.0

    with _fastsam_lock:
        interp     = _get_fastsam()
        inp_det    = interp.get_input_details()
        out_map    = {d["name"]: d for d in interp.get_output_details()}

        _REQUIRED = {"boxes", "scores", "mask_coeffs", "mask_protos"}
        _missing = _REQUIRED - set(out_map.keys())
        if _missing:
            raise HTTPException(
                500,
                detail=f"FastSAM model missing output tensors: {sorted(_missing)}. "
                       f"Available: {sorted(out_map.keys())}",
            )
        try:
            interp.set_tensor(inp_det[0]["index"], inp)
            interp.invoke()
            boxes_raw   = interp.get_tensor(out_map["boxes"]["index"])[0]
            scores_raw  = interp.get_tensor(out_map["scores"]["index"])[0]
            mask_coeffs = interp.get_tensor(out_map["mask_coeffs"]["index"])[0]
            mask_protos = interp.get_tensor(out_map["mask_protos"]["index"])[0]
        except Exception as exc:
            raise HTTPException(500, detail=f"FastSAM inference failed: {exc}")

    conf_mask = scores_raw >= CONF_THRESHOLD
    if not conf_mask.any():
        return pil_img, []

    boxes_f    = np.clip(boxes_raw[conf_mask], 0, INFER_SIZE)
    scores_f   = scores_raw[conf_mask]
    coeffs_f   = mask_coeffs[conf_mask]
    keep       = _nms(boxes_f, scores_f, NMS_IOU_THRESHOLD)[:MAX_SEGMENTS]
    proto_flat = mask_protos.reshape(-1, 32)
    img_arr    = np.array(pil_img)

    regions: list[dict] = []
    for k in keep:
        box  = boxes_f[k]
        x1n, y1n = box[0] / INFER_SIZE, box[1] / INFER_SIZE
        x2n, y2n = box[2] / INFER_SIZE, box[3] / INFER_SIZE
        if (x2n - x1n) < 0.01 or (y2n - y1n) < 0.01:
            continue

        mask_160  = _sigmoid(proto_flat @ coeffs_f[k]).reshape(160, 160)
        mask_pil  = PILImage.fromarray((mask_160 * 255).astype(np.uint8))
        mask_full = np.array(mask_pil.resize((img_w, img_h), PILImage.BILINEAR)) / 255.0

        cx1, cy1 = int(x1n * img_w), int(y1n * img_h)
        cx2, cy2 = int(x2n * img_w), int(y2n * img_h)
        crop_pil, crop_url = _make_crop(img_arr, mask_full >= 0.5, cx1, cy1, cx2, cy2)

        regions.append({
            "conf":      float(scores_f[k]),
            "x1n": x1n, "y1n": y1n, "x2n": x2n, "y2n": y2n,
            "area_ratio": (x2n - x1n) * (y2n - y1n),
            "crop_pil":   crop_pil,
            "crop_url":   crop_url,
            "mask_pil":   mask_pil,   # 160×160
        })
    return pil_img, regions


def _build_annotated(
    pil_img: PILImage.Image,
    regions: list[dict],
    colors: list[tuple[int, int, int]],
    badges: list[str],
) -> str:
    """Composite annotated image from regions; return data URL."""
    img_w, img_h = pil_img.size
    scale    = min(ANNOTATED_MAX_DIM / img_w, ANNOTATED_MAX_DIM / img_h, 1.0)
    ann_w, ann_h = int(img_w * scale), int(img_h * scale)
    ann_base = pil_img.resize((ann_w, ann_h), PILImage.LANCZOS).convert("RGBA")
    overlay  = PILImage.new("RGBA", (ann_w, ann_h), (0, 0, 0, 0))
    top      = PILImage.new("RGBA", (ann_w, ann_h), (0, 0, 0, 0))
    top_draw = ImageDraw.Draw(top)

    for reg, color, badge in zip(regions, colors, badges):
        r, g, b = color
        x1n, y1n, x2n, y2n = reg["x1n"], reg["y1n"], reg["x2n"], reg["y2n"]
        mask_ann = np.array(reg["mask_pil"].resize((ann_w, ann_h), PILImage.BILINEAR))
        rgba = np.zeros((ann_h, ann_w, 4), dtype=np.uint8)
        rgba[mask_ann > 127] = [r, g, b, MASK_ALPHA]
        overlay = PILImage.alpha_composite(overlay, PILImage.fromarray(rgba, "RGBA"))

        ax1, ay1 = int(x1n * ann_w), int(y1n * ann_h)
        ax2, ay2 = int(x2n * ann_w), int(y2n * ann_h)
        bw = max(BORDER_WIDTH, int(ann_w / 400))
        top_draw.rectangle([ax1, ay1, ax2, ay2], outline=(r, g, b, 220), width=bw)
        _draw_badge(top_draw, badge, ax1 + bw, ay1 + bw,
                    max(18, int(ann_w / 55)), color)

    ann = PILImage.alpha_composite(PILImage.alpha_composite(ann_base, overlay), top)
    return _encode_pil(ann, quality=88)


# ── FastSAM pipeline ──────────────────────────────────────────────────────────
def _run_fastsam(raw: bytes) -> SegmentResponse:
    pil_img, regions = _fastsam_regions(raw)
    img_w, img_h = pil_img.size

    colors  = [_PALETTE[i % len(_PALETTE)] for i in range(len(regions))]
    badges  = [str(i + 1) for i in range(len(regions))]
    annotated_url = _build_annotated(pil_img, regions, colors, badges)

    segments = [
        SegmentObject(
            id=i, confidence=round(reg["conf"], 3),
            bbox=[round(reg["x1n"], 4), round(reg["y1n"], 4),
                  round(reg["x2n"], 4), round(reg["y2n"], 4)],
            area_ratio=round(reg["area_ratio"], 4),
            color=list(colors[i]),
            class_name=None,
            crop_data_url=reg["crop_url"],
        )
        for i, reg in enumerate(regions)
    ]
    segments.sort(key=lambda s: s.area_ratio, reverse=True)
    return SegmentResponse(
        segments=segments, annotated_data_url=annotated_url,
        image_width=img_w, image_height=img_h, model_used="fastsam",
    )


# ── FastSAM + CLIP hybrid pipeline ───────────────────────────────────────────
def _run_hybrid(raw: bytes) -> SegmentResponse:
    """FastSAM finds fine regions → CLIP classifies each into architectural labels."""
    import torch

    pil_img, regions = _fastsam_regions(raw)
    img_w, img_h = pil_img.size
    if not regions:
        return SegmentResponse(
            segments=[], annotated_data_url=_encode_pil(pil_img),
            image_width=img_w, image_height=img_h, model_used="hybrid",
        )

    clip_m, preprocess, text_feats = _get_clip()

    # Batch-encode all crops in one CLIP forward pass
    try:
        tensors = torch.stack([preprocess(r["crop_pil"]) for r in regions])
        with torch.inference_mode():
            img_feats = clip_m.encode_image(tensors)
            img_feats = img_feats / img_feats.norm(dim=-1, keepdim=True)
            probs = (CLIP_LOGIT_SCALE * img_feats @ text_feats.T).softmax(dim=-1)  # [n, n_labels]
    except Exception as exc:
        raise HTTPException(500, detail=f"CLIP classification failed: {exc}")

    # Assign labels + colors; filter non-architectural regions
    out_regions: list[dict] = []
    out_colors:  list[tuple[int, int, int]] = []
    out_names:   list[str | None] = []
    out_confs:   list[float] = []
    badges:      list[str] = []

    label_counters: dict[str, int] = {}
    for i, (reg, prob_row) in enumerate(zip(regions, probs)):
        best_idx  = int(prob_row.argmax())
        best_conf = float(prob_row[best_idx])
        display   = _CLIP_DISPLAYS[best_idx] if best_conf >= CLIP_MIN_CONF else None

        if display is None:
            # Non-architectural OR low confidence — skip region entirely
            continue

        # Badge: class abbreviation + instance counter  e.g. "Wi2" "Do1"
        label_counters[display] = label_counters.get(display, 0) + 1
        badge = display[:2] + str(label_counters[display])

        out_regions.append(reg)
        out_colors.append(_CLIP_COLORS[best_idx])
        out_names.append(display)
        out_confs.append(round(best_conf, 3))
        badges.append(badge)

    if not out_regions:
        # All regions filtered — fall back to unclassified FastSAM view
        out_regions = regions
        out_colors  = [_PALETTE[i % len(_PALETTE)] for i in range(len(regions))]
        out_names   = [None] * len(regions)
        out_confs   = [round(r["conf"], 3) for r in regions]
        badges      = [str(i + 1) for i in range(len(regions))]

    annotated_url = _build_annotated(pil_img, out_regions, out_colors, badges)

    segments = [
        SegmentObject(
            id=i, confidence=out_confs[i],
            bbox=[round(r["x1n"], 4), round(r["y1n"], 4),
                  round(r["x2n"], 4), round(r["y2n"], 4)],
            area_ratio=round(r["area_ratio"], 4),
            color=list(out_colors[i]),
            class_name=out_names[i],
            crop_data_url=r["crop_url"],
        )
        for i, r in enumerate(out_regions)
    ]
    segments.sort(key=lambda s: s.area_ratio, reverse=True)
    return SegmentResponse(
        segments=segments, annotated_data_url=annotated_url,
        image_width=img_w, image_height=img_h, model_used="hybrid",
    )


# ── SegFormer pipeline ────────────────────────────────────────────────────────
def _run_segformer(raw: bytes) -> SegmentResponse:
    import cv2  # type: ignore
    import torch

    pil_img = PILImage.open(io.BytesIO(raw)).convert("RGB")
    img_w, img_h = pil_img.size
    img_arr      = np.array(pil_img)

    model, processor = _get_segformer()
    inputs = processor(
        images=pil_img,
        size={"height": SEG_INPUT_SIZE, "width": SEG_INPUT_SIZE},
        return_tensors="pt",
    )
    try:
        with torch.inference_mode():
            logits = model(**inputs).logits
    except Exception as exc:
        raise HTTPException(500, detail=f"SegFormer inference failed: {exc}")

    seg_map = logits[0].argmax(dim=0).numpy().astype(np.uint8)
    seg_h, seg_w = seg_map.shape
    total_seg_pixels = seg_h * seg_w

    scale    = min(ANNOTATED_MAX_DIM / img_w, ANNOTATED_MAX_DIM / img_h, 1.0)
    ann_w, ann_h = int(img_w * scale), int(img_h * scale)
    ann_base = pil_img.resize((ann_w, ann_h), PILImage.LANCZOS).convert("RGBA")
    overlay  = PILImage.new("RGBA", (ann_w, ann_h), (0, 0, 0, 0))
    top      = PILImage.new("RGBA", (ann_w, ann_h), (0, 0, 0, 0))
    top_draw = ImageDraw.Draw(top)

    segments: list[SegmentObject] = []
    seg_id = 0

    present = set(map(int, np.unique(seg_map))) & set(ARCH_CLASS_NAMES.keys())
    for class_id in sorted(present):
        if seg_id >= MAX_TOTAL_INSTANCES:
            break
        class_name = ARCH_CLASS_NAMES[class_id]
        color      = ARCH_CLASS_COLORS.get(class_id, _PALETTE[class_id % len(_PALETTE)])
        r, g, b    = color

        class_mask = (seg_map == class_id).astype(np.uint8)
        n_labels, labeled_arr = cv2.connectedComponents(class_mask)

        comp_sizes = sorted(
            ((i, int((labeled_arr == i).sum())) for i in range(1, n_labels)),
            key=lambda x: x[1], reverse=True,
        )
        inst = 0
        for comp_id, n_pix in comp_sizes:
            if inst >= MAX_INSTANCES_PER_CLASS or seg_id >= MAX_TOTAL_INSTANCES:
                break
            if n_pix / total_seg_pixels < MIN_INSTANCE_AREA:
                continue

            comp_mask = (labeled_arr == comp_id).astype(np.uint8)
            rows = np.where(np.any(comp_mask, axis=1))[0]
            cols = np.where(np.any(comp_mask, axis=0))[0]
            if rows.size == 0 or cols.size == 0:
                continue

            x1n = float(cols[0])  / seg_w
            y1n = float(rows[0])  / seg_h
            x2n = float(cols[-1]) / seg_w
            y2n = float(rows[-1]) / seg_h

            mask_full = cv2.resize(comp_mask, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
            cx1, cy1 = int(x1n * img_w), int(y1n * img_h)
            cx2, cy2 = int(x2n * img_w), int(y2n * img_h)
            _, crop_url = _make_crop(img_arr, mask_full.astype(bool), cx1, cy1, cx2 + 1, cy2 + 1)

            mask_ann = cv2.resize(comp_mask * 255, (ann_w, ann_h), interpolation=cv2.INTER_NEAREST)
            rgba = np.zeros((ann_h, ann_w, 4), dtype=np.uint8)
            rgba[mask_ann > 127] = [r, g, b, MASK_ALPHA]
            overlay = PILImage.alpha_composite(overlay, PILImage.fromarray(rgba, "RGBA"))

            ax1, ay1 = int(x1n * ann_w), int(y1n * ann_h)
            ax2, ay2 = int(x2n * ann_w), int(y2n * ann_h)
            bw = max(BORDER_WIDTH, int(ann_w / 400))
            top_draw.rectangle([ax1, ay1, ax2, ay2], outline=(r, g, b, 220), width=bw)
            _draw_badge(top_draw, class_name[:2] + str(inst + 1),
                        ax1 + bw, ay1 + bw, max(20, int(ann_w / 48)), color)

            segments.append(SegmentObject(
                id=seg_id, confidence=1.0,
                bbox=[round(x1n, 4), round(y1n, 4), round(x2n, 4), round(y2n, 4)],
                area_ratio=round(float(n_pix / total_seg_pixels), 4),
                color=list(color), class_name=class_name, crop_data_url=crop_url,
            ))
            seg_id += 1
            inst   += 1

    ann_final = PILImage.alpha_composite(PILImage.alpha_composite(ann_base, overlay), top)
    segments.sort(key=lambda s: s.area_ratio, reverse=True)
    return SegmentResponse(
        segments=segments, annotated_data_url=_encode_pil(ann_final, quality=88),
        image_width=img_w, image_height=img_h, model_used="segformer",
    )


# ── DB image loader ───────────────────────────────────────────────────────────
def _load_image(image_id: str, db: Session, settings: Settings) -> bytes | None:
    import uuid as _uuid
    from app.models.source import Image
    from app.workers.ingest_worker import _resolve_storage_path
    try:
        row = db.query(Image).filter(Image.id == _uuid.UUID(image_id)).first()
        if row is not None:
            p = Path(_resolve_storage_path(row.storage_path, settings))
            if p.exists():
                return p.read_bytes()
    except Exception as exc:
        logger.warning("_load_image db lookup failed: %s", exc)
    try:
        storage_root = Path(settings.storage_root) / "images"
        for ext in (".jpg", ".jpeg", ".png", ".webp"):
            p = storage_root / f"{image_id}{ext}"
            if p.exists():
                return p.read_bytes()
    except Exception as exc:
        logger.warning("_load_image fallback failed: %s", exc)
    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────
def _dispatch(model: str, raw: bytes) -> SegmentResponse:
    """Synchronous dispatcher — safe to call from run_in_executor."""
    if model == "hybrid":
        return _run_hybrid(raw)
    if model == "segformer":
        return _run_segformer(raw)
    return _run_fastsam(raw)


@router.post("/images/{image_id}/segment", response_model=SegmentResponse)
async def segment_image(
    image_id: str,
    model: Literal["fastsam"] = Query(default="fastsam"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SegmentResponse:
    import asyncio, functools
    raw = _load_image(image_id, db, settings)
    # Close DB connection before long inference so PostgreSQL tx doesn't time out
    try:
        db.close()
    except Exception:
        pass
    if raw is None:
        raise HTTPException(404, detail="Image not found in storage")
    # Run sync ML inference off the event loop to avoid starving connection keepalives
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(_dispatch, model, raw))


@router.get("/images/segments/{segment_id}/crop")
async def get_segment_crop(
    segment_id: str,
    db: Session = Depends(get_db),
) -> Any:
    """Serve the stored crop thumbnail for an indexed segment."""
    import uuid as _uuid
    from fastapi.responses import Response
    from app.models.segment import ImageSegment

    try:
        seg_uuid = _uuid.UUID(segment_id)
    except ValueError:
        raise HTTPException(400, detail="Invalid segment id")
    seg = db.query(ImageSegment).filter(ImageSegment.id == seg_uuid).first()
    if seg is None or not seg.crop_path:
        raise HTTPException(404, detail="Segment crop not found")
    p = Path(seg.crop_path)
    if not p.exists():
        raise HTTPException(404, detail="Segment crop file missing")
    return Response(
        content=p.read_bytes(),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.post("/images/segment-upload", response_model=SegmentResponse)
async def segment_image_upload(
    file: UploadFile = File(...),
    model: Literal["fastsam"] = Query(default="fastsam"),
) -> SegmentResponse:
    import asyncio, functools
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, detail="Only image files are supported")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, detail="Empty file")
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(_dispatch, model, raw))
