'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanSearch, X, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Eye, Search,
} from 'lucide-react';
import { segmentImage, segmentImageFromUrl } from '@/lib/api';
import type { SegmentObject, SegmentResponse } from '@/lib/api';

interface SegmentPanelProps {
  imageId: string;
  imageUrl?: string;
  /** When set, each detected segment gets a "Find similar" action. */
  onFindSimilar?: (seg: SegmentObject) => void;
}

type LoadState = 'idle' | 'loading' | 'done' | 'error';

const MIN_AREA = 0.003;

function areaLabel(ratio: number): string {
  if (ratio > 0.4) return 'Large';
  if (ratio > 0.15) return 'Medium';
  return 'Small';
}

// ── Zoom helpers ──────────────────────────────────────────────────────────────
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 0.35;
function clampScale(s: number) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)); }
function clampPan(pan: number, scale: number, dim: number) {
  if (scale <= 1) return 0;
  const limit = (dim * (scale - 1)) / 2;
  return Math.min(limit, Math.max(-limit, pan));
}

// ── Fragment canvas (reused in both panel + preview modal) ────────────────────
const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag

interface FragmentCanvasProps {
  segments: SegmentObject[];
  imageWidth: number;
  imageHeight: number;
  originalUrl?: string;
  compact?: boolean; // true = panel thumbnail, false = modal large view
  /** Region highlighted from outside (legend hover). */
  highlightId?: number | null;
  /** Click a piece → action bar "View" opens the region detail. */
  onOpenRegion?: (seg: SegmentObject) => void;
  /** Click a piece → action bar "Find similar"; drag a piece onto the dock. */
  onFindSimilar?: (seg: SegmentObject) => void;
}

function FragmentCanvas({
  segments, imageWidth, imageHeight, originalUrl, compact = false,
  highlightId = null, onOpenRegion, onFindSimilar,
}: FragmentCanvasProps) {
  const [offsets, setOffsets] = useState<Record<number, { dx: number; dy: number }>>({});
  const [dragging, setDragging] = useState<{
    id: number; startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [overDock, setOverDock] = useState(false);
  const [introSeen, setIntroSeen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const aspect = imageHeight / imageWidth;

  const getOffset = (id: number) => offsets[id] ?? { dx: 0, dy: 0 };
  const isExploded = Object.values(offsets).some(o => o.dx !== 0 || o.dy !== 0);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, segId: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    setIntroSeen(true);
    const cur = offsets[segId] ?? { dx: 0, dy: 0 };
    setDragging({ id: segId, startX: e.clientX, startY: e.clientY, baseDx: cur.dx, baseDy: cur.dy, moved: false });
  }, [offsets]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const mx = e.clientX - dragging.startX;
    const my = e.clientY - dragging.startY;
    if (!dragging.moved && Math.hypot(mx, my) < DRAG_THRESHOLD) return;
    if (!dragging.moved) setDragging({ ...dragging, moved: true });
    setOffsets(prev => ({
      ...prev,
      [dragging.id]: { dx: dragging.baseDx + mx, dy: dragging.baseDy + my },
    }));
    const dock = dockRef.current?.getBoundingClientRect();
    setOverDock(!!dock &&
      e.clientX >= dock.left && e.clientX <= dock.right &&
      e.clientY >= dock.top && e.clientY <= dock.bottom);
  }, [dragging]);

  const onPointerUp = useCallback(() => {
    if (!dragging) return;
    const seg = segments.find(s => s.id === dragging.id);
    if (!dragging.moved) {
      // Plain click → toggle selection (opens action bar)
      setSelectedId(prev => (prev === dragging.id ? null : dragging.id));
    } else {
      // Drag release: dock = search, anywhere else = spring back
      if (overDock && seg && onFindSimilar) onFindSimilar(seg);
      setOffsets(prev => ({
        ...prev,
        [dragging.id]: { dx: dragging.baseDx, dy: dragging.baseDy },
      }));
    }
    setDragging(null);
    setOverDock(false);
  }, [dragging, segments, overDock, onFindSimilar]);

  const onCanvasPointerDown = useCallback(() => {
    setIntroSeen(true);
    setSelectedId(null);
  }, []);

  const resetAll = useCallback(() => setOffsets({}), []);

  const explode = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setIntroSeen(true);
    const w = container.clientWidth;
    const h = container.clientHeight;
    const newOffsets: Record<number, { dx: number; dy: number }> = {};
    segments.forEach((seg) => {
      const cx = (seg.bbox[0] + seg.bbox[2]) / 2 - 0.5;
      const cy = (seg.bbox[1] + seg.bbox[3]) / 2 - 0.5;
      newOffsets[seg.id] = {
        dx: cx * w * 0.75 + (Math.random() - 0.5) * 30,
        dy: cy * h * 0.75 + (Math.random() - 0.5) * 30,
      };
    });
    setOffsets(newOffsets);
  }, [segments]);

  const selectedSeg = selectedId !== null ? segments.find(s => s.id === selectedId) ?? null : null;
  const isDragMoving = !!dragging?.moved;

  return (
    <div className={`seg-frag-wrap${compact ? ' seg-frag-wrap--compact' : ''}`}>
      <div
        ref={containerRef}
        className="seg-frag-canvas"
        style={{ paddingBottom: `${aspect * 100}%` }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {originalUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={originalUrl} alt="" className="seg-frag-bg" draggable={false} />
        )}
        {segments.map((seg) => {
          const [x1, y1, x2, y2] = seg.bbox;
          const { dx, dy } = getOffset(seg.id);
          const active = dragging?.id === seg.id;
          const selected = selectedId === seg.id;
          const highlighted = highlightId === seg.id;
          const emphasized = active || selected || highlighted;
          const colorRgb = `rgb(${seg.color.join(',')})`;
          return (
            <div
              key={seg.id}
              className="seg-frag-piece"
              style={{
                left:   `${x1 * 100}%`,
                top:    `${y1 * 100}%`,
                width:  `${(x2 - x1) * 100}%`,
                height: `${(y2 - y1) * 100}%`,
                transform: `translate(${dx}px, ${dy}px)${emphasized && !active ? ' scale(1.02)' : ''}`,
                transition: active ? 'none' : 'transform 0.38s cubic-bezier(0.34,1.4,0.64,1), outline-color 0.15s, box-shadow 0.15s, filter 0.15s',
                zIndex: active ? 20 : emphasized ? 10 : 1,
                // Outline renders outside overflow:hidden, always visible
                outline: emphasized ? `3px solid ${colorRgb}` : `2px solid ${colorRgb}`,
                outlineOffset: emphasized ? '1px' : '0px',
                boxShadow: emphasized
                  ? `0 8px 28px rgba(0,0,0,0.65), 0 0 0 1px ${colorRgb}`
                  : `0 2px 6px rgba(0,0,0,0.35)`,
                filter: highlighted && !active ? 'brightness(1.12)' : undefined,
                cursor: active ? 'grabbing' : 'pointer',
              }}
              onPointerDown={(e) => onPointerDown(e, seg.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={seg.crop_data_url} alt="" draggable={false} />
              {seg.class_name && (
                <span className="seg-frag-label" style={{ background: colorRgb }}>
                  {seg.class_name}
                </span>
              )}
            </div>
          );
        })}

      </div>

      {/* Overlays live on the wrap (not the canvas) so the compact
          max-height clip can never hide them. */}
      {!introSeen && (onOpenRegion || onFindSimilar) && (
        <div className="seg-frag-intro">
          Click a region for actions{onFindSimilar ? ' · drag it down to search' : ''}
        </div>
      )}

      {/* Drop dock — appears only while a piece is being dragged */}
      {isDragMoving && onFindSimilar && (
        <div
          ref={dockRef}
          className={`seg-frag-dock${overDock ? ' seg-frag-dock--hot' : ''}`}
        >
          <Search size={12} />
          {overDock ? 'Release to search' : 'Drop here to find similar'}
        </div>
      )}

      {/* Selected-region action bar */}
      {selectedSeg && !isDragMoving && (
        <div className="seg-frag-actionbar" onPointerDown={(e) => e.stopPropagation()}>
          <span className="seg-frag-actionbar-name">
            <span className="seg-legend-dot" style={{ background: `rgb(${selectedSeg.color.join(',')})` }} />
            {selectedSeg.class_name ?? `Region ${segments.indexOf(selectedSeg) + 1}`}
          </span>
          {onOpenRegion && (
            <button
              className="seg-frag-action"
              onClick={() => { setSelectedId(null); onOpenRegion(selectedSeg); }}
            >
              <Eye size={11} /> View
            </button>
          )}
          {onFindSimilar && (
            <button
              className="seg-frag-action seg-frag-action--primary"
              onClick={() => { setSelectedId(null); onFindSimilar(selectedSeg); }}
            >
              <Search size={11} /> Find similar
            </button>
          )}
          <button className="seg-frag-action seg-frag-action--close" onClick={() => setSelectedId(null)}>
            <X size={11} />
          </button>
        </div>
      )}
      <div className="seg-frag-controls">
        <button className="seg-frag-btn" onClick={isExploded ? resetAll : explode}>
          {isExploded ? 'Merge' : 'Explode'}
        </button>
        <span className="seg-frag-hint">
          {isDragMoving
            ? 'drop on dock to search'
            : onFindSimilar
              ? 'click region · drag to search'
              : 'click region for actions'}
        </span>
      </div>
    </div>
  );
}

// ── Segmentation preview modal ────────────────────────────────────────────────
interface SegPreviewModalProps {
  result: SegmentResponse;
  segments: SegmentObject[];
  originalUrl?: string;
  onClose: () => void;
  onOpenRegion: (idx: number) => void;
  onFindSimilar?: (seg: SegmentObject) => void;
}

function SegPreviewModal({ result, segments, originalUrl, onClose, onOpenRegion, onFindSimilar }: SegPreviewModalProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<'fragments' | 'annotated'>('fragments');

  // Zoom state for annotated tab
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const annContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDist = useRef<number | null>(null);

  const resetZoom = useCallback(() => { setScale(1); setPanX(0); setPanY(0); }, []);
  // Reset zoom + selection when switching tabs
  useEffect(() => { if (tab === 'annotated') resetZoom(); setSelectedIdx(null); }, [tab, resetZoom]);
  // Zooming in dismisses region selection (hit-test only valid at scale 1)
  useEffect(() => { if (scale > 1) setSelectedIdx(null); }, [scale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (tab === 'annotated') {
        if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
        if (e.key === '-') zoomBy(-ZOOM_STEP);
        if (e.key === '0') resetZoom();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, tab, resetZoom]);

  const zoomBy = useCallback((delta: number, ox = 0, oy = 0) => {
    const c = annContainerRef.current;
    const w = c?.clientWidth ?? 900; const h = c?.clientHeight ?? 600;
    setScale((s) => {
      const ns = clampScale(s + delta * s); const ratio = ns / s;
      setPanX((px) => clampPan(ox * (1 - ratio) + px * ratio, ns, w));
      setPanY((py) => clampPan(oy * (1 - ratio) + py * ratio, ns, h));
      return ns;
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const c = annContainerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const ox = e.clientX - rect.left - rect.width / 2;
    const oy = e.clientY - rect.top  - rect.height / 2;
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP, ox, oy);
  }, [zoomBy]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    e.preventDefault();
  }, [scale, panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const c = annContainerRef.current;
    setPanX(clampPan(dragStart.current.panX + e.clientX - dragStart.current.x, scale, c?.clientWidth  ?? 900));
    setPanY(clampPan(dragStart.current.panY + e.clientY - dragStart.current.y, scale, c?.clientHeight ?? 600));
  }, [scale]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      lastPinchDist.current = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
    } else if (e.touches.length === 1 && scale > 1) {
      isDragging.current = true;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX, panY };
    }
  }, [scale, panX, panY]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const c = annContainerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      const mid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      const ox = mid.x - rect.left - rect.width / 2;
      const oy = mid.y - rect.top  - rect.height / 2;
      const factor = dist / lastPinchDist.current;
      setScale((s) => {
        const ns = clampScale(s * factor); const ratio = ns / s;
        setPanX((px) => clampPan(ox * (1 - ratio) + px * ratio, ns, rect.width));
        setPanY((py) => clampPan(oy * (1 - ratio) + py * ratio, ns, rect.height));
        return ns;
      });
      lastPinchDist.current = dist;
    } else if (e.touches.length === 1 && isDragging.current) {
      setPanX(clampPan(dragStart.current.panX + e.touches[0].clientX - dragStart.current.x, scale, rect.width));
      setPanY(clampPan(dragStart.current.panY + e.touches[0].clientY - dragStart.current.y, scale, rect.height));
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) lastPinchDist.current = null;
    if (e.touches.length === 0) isDragging.current = false;
  }, []);

  // Hover for region identification (only works at scale=1 due to coordinate mapping)
  const handleImageMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (scale > 1) { setHoverIdx(null); return; }
    const c = annContainerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    // The img fills the container width; find actual rendered img bounds
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top)  / rect.height;
    let best: SegmentObject | null = null; let bestArea = Infinity;
    for (const seg of segments) {
      const [x1, y1, x2, y2] = seg.bbox;
      if (rx >= x1 && rx <= x2 && ry >= y1 && ry <= y2 && seg.area_ratio < bestArea) { best = seg; bestArea = seg.area_ratio; }
    }
    setHoverIdx(best ? segments.indexOf(best) : null);
  }, [scale, segments]);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (scale > 1) return; // clicking while zoomed = pan, not region select
    const c = annContainerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top)  / rect.height;
    let best: SegmentObject | null = null; let bestArea = Infinity;
    for (const seg of segments) {
      const [x1, y1, x2, y2] = seg.bbox;
      if (rx >= x1 && rx <= x2 && ry >= y1 && ry <= y2 && seg.area_ratio < bestArea) { best = seg; bestArea = seg.area_ratio; }
    }
    // Click region → action bar; click empty space or same region → dismiss
    setSelectedIdx((prev) => {
      if (!best) return null;
      const idx = segments.indexOf(best);
      return prev === idx ? null : idx;
    });
  }, [scale, segments]);

  const hoverSeg = hoverIdx !== null ? segments[hoverIdx] : null;
  const zoomPct = Math.round(scale * 100);

  return (
    <AnimatePresence>
      <motion.div
        className="seg-preview-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="seg-preview-modal"
          initial={{ opacity: 0, scale: 0.97, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 18 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="seg-preview-header">
            <div className="seg-preview-title">
              <ScanSearch size={13} />
              <span>Segmentation</span>
              <span className="seg-preview-count">{segments.length} regions</span>
              <span className="seg-preview-dim">{result.image_width}×{result.image_height}px</span>
            </div>
            <div className="seg-preview-tabs">
              <button className={`seg-preview-tab${tab === 'fragments' ? ' seg-preview-tab--active' : ''}`} onClick={() => setTab('fragments')}>Fragments</button>
              <button className={`seg-preview-tab${tab === 'annotated' ? ' seg-preview-tab--active' : ''}`} onClick={() => setTab('annotated')}>Annotated</button>
            </div>
            <button className="seg-preview-close" onClick={onClose}><X size={16} /></button>
          </div>

          {/* Content */}
          <div className="seg-preview-body">
            {tab === 'fragments' ? (
              <FragmentCanvas
                segments={segments}
                imageWidth={result.image_width}
                imageHeight={result.image_height}
                originalUrl={originalUrl}
                compact={false}
                onOpenRegion={(seg) => { onClose(); onOpenRegion(segments.indexOf(seg)); }}
                onFindSimilar={onFindSimilar ? (seg) => { onClose(); onFindSimilar(seg); } : undefined}
              />
            ) : (
              <div
                className="seg-preview-annotated"
                ref={annContainerRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp(); setHoverIdx(null); }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleImageClick}
                style={{ cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'crosshair' }}
              >
                {hoverSeg && scale <= 1 && (
                  <div className="seg-hover-tip">
                    {hoverSeg.class_name ?? `Region ${(hoverIdx ?? 0) + 1}`}
                    {' '}· {areaLabel(hoverSeg.area_ratio)}
                    <span className="seg-hover-dot" style={{ background: `rgb(${hoverSeg.color.join(',')})` }} />
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.annotated_data_url}
                  alt="Segmented"
                  className="seg-preview-ann-img"
                  style={{
                    transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
                    transformOrigin: 'center center',
                    transition: isDragging.current ? 'none' : 'transform 0.08s ease-out',
                  }}
                  draggable={false}
                />
                {/* Selected region: bbox highlight + action bar */}
                {selectedIdx !== null && scale <= 1 && (() => {
                  const seg = segments[selectedIdx];
                  const [x1, y1, x2, y2] = seg.bbox;
                  const colorRgb = `rgb(${seg.color.join(',')})`;
                  return (
                    <>
                      <div
                        className="seg-ann-select-box"
                        style={{
                          left:   `${x1 * 100}%`,
                          top:    `${y1 * 100}%`,
                          width:  `${(x2 - x1) * 100}%`,
                          height: `${(y2 - y1) * 100}%`,
                          borderColor: colorRgb,
                          boxShadow: `0 0 0 1px ${colorRgb}, 0 0 18px rgba(0,0,0,0.4)`,
                        }}
                      />
                      <div
                        className="seg-frag-actionbar seg-frag-actionbar--annotated"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <span className="seg-frag-actionbar-name">
                          <span className="seg-legend-dot" style={{ background: colorRgb }} />
                          {seg.class_name ?? `Region ${selectedIdx + 1}`}
                        </span>
                        <button
                          className="seg-frag-action"
                          onClick={() => { onClose(); onOpenRegion(selectedIdx); }}
                        >
                          <Eye size={11} /> View
                        </button>
                        {onFindSimilar && (
                          <button
                            className="seg-frag-action seg-frag-action--primary"
                            onClick={() => { onClose(); onFindSimilar(seg); }}
                          >
                            <Search size={11} /> Find similar
                          </button>
                        )}
                        <button className="seg-frag-action seg-frag-action--close" onClick={() => setSelectedIdx(null)}>
                          <X size={11} />
                        </button>
                      </div>
                    </>
                  );
                })()}

                {/* Zoom controls */}
                <div className="seg-zoom-controls">
                  <button className="seg-zoom-btn" onClick={(e) => { e.stopPropagation(); zoomBy(ZOOM_STEP); }} title="Zoom in (+)"><ZoomIn size={13} /></button>
                  <span className="seg-zoom-level">{zoomPct}%</span>
                  <button className="seg-zoom-btn" onClick={(e) => { e.stopPropagation(); zoomBy(-ZOOM_STEP); }} disabled={scale <= 1} title="Zoom out (-)"><ZoomOut size={13} /></button>
                  <button className="seg-zoom-btn" onClick={(e) => { e.stopPropagation(); resetZoom(); }} disabled={scale <= 1} title="Reset (0)"><Maximize2 size={13} /></button>
                </div>
              </div>
            )}

            {/* Legend always visible at bottom */}
            <div className="seg-preview-legend">
              {segments.map((seg, i) => (
                <button
                  key={seg.id}
                  className="seg-legend-item"
                  onClick={() => { onClose(); onOpenRegion(i); }}
                  title={`Region ${i + 1} · ${(seg.area_ratio * 100).toFixed(1)}%`}
                >
                  <span className="seg-legend-dot" style={{ background: `rgb(${seg.color.join(',')})` }} />
                  <span className="seg-legend-num">{i + 1}</span>
                  <span className="seg-legend-area">{(seg.area_ratio * 100).toFixed(0)}%</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Hero modal (individual region zoom view) ──────────────────────────────────
interface HeroModalProps {
  segments: SegmentObject[];
  initialIdx: number;
  onClose: () => void;
  onFindSimilar?: (seg: SegmentObject) => void;
}

function HeroModal({ segments, initialIdx, onClose, onFindSimilar }: HeroModalProps) {
  const [idx, setIdx] = useState(initialIdx);
  const seg = segments[idx];
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchMid  = useRef<{ x: number; y: number } | null>(null);

  const resetZoom = useCallback(() => { setScale(1); setPanX(0); setPanY(0); }, []);
  useEffect(() => { resetZoom(); }, [idx, resetZoom]);

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx((i) => Math.min(segments.length - 1, i + 1)), [segments.length]);

  const zoomBy = useCallback((delta: number, ox = 0, oy = 0) => {
    const c = imgContainerRef.current;
    const w = c?.clientWidth ?? 600; const h = c?.clientHeight ?? 400;
    setScale((s) => {
      const ns = clampScale(s + delta * s); const ratio = ns / s;
      setPanX((px) => clampPan(ox * (1 - ratio) + px * ratio, ns, w));
      setPanY((py) => clampPan(oy * (1 - ratio) + py * ratio, ns, h));
      return ns;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (scale > 1) resetZoom(); else onClose(); }
      if (e.key === 'ArrowLeft'  && scale <= 1) prev();
      if (e.key === 'ArrowRight' && scale <= 1) next();
      if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
      if (e.key === '-') zoomBy(-ZOOM_STEP);
      if (e.key === '0') resetZoom();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, scale, prev, next, resetZoom, zoomBy]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const c = imgContainerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const ox = e.clientX - rect.left - rect.width / 2;
    const oy = e.clientY - rect.top  - rect.height / 2;
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setScale((s) => {
      const ns = clampScale(s + delta * s); const ratio = ns / s;
      setPanX((px) => clampPan(ox * (1 - ratio) + px * ratio, ns, rect.width));
      setPanY((py) => clampPan(oy * (1 - ratio) + py * ratio, ns, rect.height));
      return ns;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    e.preventDefault();
  }, [scale, panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const c = imgContainerRef.current;
    setPanX(clampPan(dragStart.current.panX + e.clientX - dragStart.current.x, scale, c?.clientWidth  ?? 600));
    setPanY(clampPan(dragStart.current.panY + e.clientY - dragStart.current.y, scale, c?.clientHeight ?? 400));
  }, [scale]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      lastPinchDist.current = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      lastPinchMid.current  = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
    } else if (e.touches.length === 1) {
      isDragging.current = true;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX, panY };
    }
  }, [panX, panY]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const c = imgContainerRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    if (e.touches.length === 2 && lastPinchDist.current !== null && lastPinchMid.current !== null) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const mid  = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const ox = mid.x - rect.left - rect.width / 2;
      const oy = mid.y - rect.top  - rect.height / 2;
      const factor = dist / lastPinchDist.current;
      setScale((s) => {
        const ns = clampScale(s * factor); const ratio = ns / s;
        setPanX((px) => clampPan(ox * (1 - ratio) + px * ratio, ns, rect.width));
        setPanY((py) => clampPan(oy * (1 - ratio) + py * ratio, ns, rect.height));
        return ns;
      });
      lastPinchDist.current = dist; lastPinchMid.current = mid;
    } else if (e.touches.length === 1 && isDragging.current && scale > 1) {
      setPanX(clampPan(dragStart.current.panX + e.touches[0].clientX - dragStart.current.x, scale, rect.width));
      setPanY(clampPan(dragStart.current.panY + e.touches[0].clientY - dragStart.current.y, scale, rect.height));
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) { lastPinchDist.current = null; lastPinchMid.current = null; }
    if (e.touches.length === 0) isDragging.current = false;
  }, []);

  const [r, g, b] = seg.color;
  const colorStr = `rgb(${r},${g},${b})`;

  return (
    <AnimatePresence>
      <motion.div
        className="seg-hero-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="seg-hero-card"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="seg-hero-header">
            <div className="seg-hero-title">
              <span className="seg-hero-dot" style={{ background: colorStr }} />
              <span>{seg.class_name ?? `Region ${idx + 1}`}</span>
              {seg.class_name && <span className="seg-hero-instance">#{idx + 1}</span>}
              <span className="seg-hero-area">{areaLabel(seg.area_ratio)} · {(seg.area_ratio * 100).toFixed(1)}%</span>
            </div>
            <div className="seg-hero-nav">
              <button className="seg-hero-nav-btn" onClick={prev} disabled={idx === 0}><ChevronLeft size={16} /></button>
              <span className="seg-hero-counter">{idx + 1} / {segments.length}</span>
              <button className="seg-hero-nav-btn" onClick={next} disabled={idx === segments.length - 1}><ChevronRight size={16} /></button>
            </div>
            <button className="seg-hero-close" onClick={onClose}><X size={16} /></button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              className="seg-hero-image"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              ref={imgContainerRef}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={resetZoom}
              style={{ cursor: scale > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'zoom-in' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={seg.crop_data_url}
                alt={`Region ${idx + 1}`}
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  transition: isDragging.current ? 'none' : 'transform 0.08s ease-out',
                  userSelect: 'none', pointerEvents: 'none', willChange: 'transform',
                }}
                draggable={false}
              />
              <div className="seg-zoom-controls">
                <button className="seg-zoom-btn" onClick={(e) => { e.stopPropagation(); zoomBy(ZOOM_STEP); }} title="Zoom in (+)"><ZoomIn size={13} /></button>
                <span className="seg-zoom-level">{Math.round(scale * 100)}%</span>
                <button className="seg-zoom-btn" onClick={(e) => { e.stopPropagation(); zoomBy(-ZOOM_STEP); }} disabled={scale <= 1} title="Zoom out (-)"><ZoomOut size={13} /></button>
                <button className="seg-zoom-btn" onClick={(e) => { e.stopPropagation(); resetZoom(); }} disabled={scale <= 1} title="Reset (0)"><Maximize2 size={13} /></button>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="seg-hero-footer">
            <div className="seg-hero-color-strip" style={{ background: colorStr }} />
            <dl className="seg-hero-stats">
              {seg.class_name && <><dt>Class</dt><dd>{seg.class_name}</dd></>}
              <dt>Area</dt><dd>{(seg.area_ratio * 100).toFixed(1)}% of image</dd>
              <dt>Position</dt>
              <dd>({(seg.bbox[0]*100).toFixed(0)}%,{(seg.bbox[1]*100).toFixed(0)}%) → ({(seg.bbox[2]*100).toFixed(0)}%,{(seg.bbox[3]*100).toFixed(0)}%)</dd>
              <dt>Size</dt><dd>{areaLabel(seg.area_ratio)}</dd>
            </dl>
            {onFindSimilar && (
              <button
                className="seg-find-similar-btn"
                onClick={() => { onClose(); onFindSimilar(seg); }}
                title="Search the corpus for visually similar components"
              >
                <Search size={9} />
                Find similar {seg.class_name ? seg.class_name.toLowerCase() : 'components'}
              </button>
            )}
            <p className="seg-hero-hint">Scroll / pinch to zoom · drag to pan · double-click to reset · ← → navigate</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function SegmentPanel({ imageId, imageUrl, onFindSimilar }: SegmentPanelProps) {
  const [state, setState] = useState<LoadState>('idle');
  const [result, setResult] = useState<SegmentResponse | null>(null);
  const [error, setError] = useState('');
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const run = useCallback(async () => {
    setState('loading');
    setError('');
    setResult(null);
    try {
      const isEphemeral = imageId.startsWith('ephemeral-');
      const data = isEphemeral && imageUrl
        ? await segmentImageFromUrl(imageUrl, 'fastsam')
        : await segmentImage(imageId, 'fastsam');
      setResult(data);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Segmentation failed');
      setState('error');
    }
  }, [imageId, imageUrl]);

  useEffect(() => { run(); }, [run]);

  const visibleSegments = (result?.segments.filter((s) => s.area_ratio >= MIN_AREA) ?? []).slice(0, 20);

  return (
    <div className="seg-panel">
      {/* Header */}
      <div className="seg-panel-head">
        <div className="seg-panel-label">
          <ScanSearch size={11} />
          Object Segmentation
        </div>
        <div className="seg-panel-head-actions">
          {state === 'done' && visibleSegments.length > 0 && (
            <button
              className="seg-preview-trigger"
              onClick={() => setShowPreview(true)}
              title="Preview segmentation"
            >
              <Eye size={13} />
              Preview
            </button>
          )}
          <button className="seg-rerun-inline" onClick={run} title="Re-run" disabled={state === 'loading'}>
            <RefreshCw size={11} />
          </button>
        </div>
        <p className="seg-panel-sub">FastSAM-s · region detection</p>
      </div>

      {state === 'loading' && (
        <div className="seg-loading">
          <div className="seg-loading-spinner" />
          <p>Analysing image&hellip;</p>
          <span>Processing</span>
        </div>
      )}

      {state === 'error' && (
        <div className="seg-error">
          <AlertCircle size={20} />
          <p>{error}</p>
          <button className="seg-retry" onClick={run}><RefreshCw size={11} /> Retry</button>
        </div>
      )}

      {state === 'done' && result && (
        <div className="seg-annotated-wrap">
          {visibleSegments.length === 0 ? (
            <div className="seg-empty">
              <ScanSearch size={24} opacity={0.3} />
              <p>No distinct regions detected</p>
            </div>
          ) : (
            <>
              {/* Fragment canvas — compact thumbnail */}
              <FragmentCanvas
                segments={visibleSegments}
                imageWidth={result.image_width}
                imageHeight={result.image_height}
                originalUrl={imageUrl}
                compact={true}
                onOpenRegion={(seg) => setModalIdx(visibleSegments.indexOf(seg))}
                onFindSimilar={onFindSimilar}
              />

              <div className="seg-annotated-meta">
                {visibleSegments.length} region{visibleSegments.length !== 1 ? 's' : ''} · {result.image_width}×{result.image_height}px
              </div>
            </>
          )}
        </div>
      )}

      {/* Preview modal */}
      {showPreview && result && visibleSegments.length > 0 && (
        <SegPreviewModal
          result={result}
          segments={visibleSegments}
          originalUrl={imageUrl}
          onClose={() => setShowPreview(false)}
          onOpenRegion={(idx) => { setShowPreview(false); setModalIdx(idx); }}
          onFindSimilar={onFindSimilar}
        />
      )}

      {/* Region zoom modal */}
      {modalIdx !== null && visibleSegments.length > 0 && (
        <HeroModal
          segments={visibleSegments}
          initialIdx={modalIdx}
          onClose={() => setModalIdx(null)}
          onFindSimilar={onFindSimilar}
        />
      )}
    </div>
  );
}
