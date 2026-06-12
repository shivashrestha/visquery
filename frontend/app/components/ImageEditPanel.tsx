'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2,
  Download, RefreshCcw, SunMedium, Contrast, Droplets, Wind,
} from 'lucide-react';

interface Adjustments {
  brightness: number;   // -100 to +100 (0 = original)
  contrast: number;     // -100 to +100
  saturation: number;   // -100 to +100
  blur: number;         // 0 to 10
}

type FilterPreset = 'none' | 'grayscale' | 'sepia' | 'invert' | 'warm' | 'cool' | 'vivid' | 'matte';

const FILTER_PRESETS: { id: FilterPreset; label: string }[] = [
  { id: 'none',      label: 'Original' },
  { id: 'warm',      label: 'Warm' },
  { id: 'cool',      label: 'Cool' },
  { id: 'vivid',     label: 'Vivid' },
  { id: 'matte',     label: 'Matte' },
  { id: 'grayscale', label: 'B&W' },
  { id: 'sepia',     label: 'Sepia' },
  { id: 'invert',    label: 'Invert' },
];

function buildFilter(adj: Adjustments, preset: FilterPreset): string {
  const brightness = 1 + adj.brightness / 100;
  const contrast = 1 + adj.contrast / 100;
  const saturation = 1 + adj.saturation / 100;
  const blur = adj.blur > 0 ? `blur(${adj.blur * 0.5}px)` : '';

  const presetFilters: Record<FilterPreset, string> = {
    none:      '',
    grayscale: 'grayscale(1)',
    sepia:     'sepia(0.85)',
    invert:    'invert(1)',
    warm:      'sepia(0.3) saturate(1.4)',
    cool:      'hue-rotate(180deg) saturate(0.7)',
    vivid:     'saturate(1.8) contrast(1.1)',
    matte:     'saturate(0.6) brightness(0.95)',
  };

  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${saturation.toFixed(3)})`,
    blur,
    presetFilters[preset],
  ].filter(Boolean);

  return parts.join(' ');
}

interface ImageEditPanelProps {
  imageUrl: string;
  imageTitle?: string;
}

const DEFAULT_ADJ: Adjustments = { brightness: 0, contrast: 0, saturation: 0, blur: 0 };

interface SliderRowProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, icon, value, min, max, step = 1, onChange }: SliderRowProps) {
  const isDefault = value === 0;
  return (
    <div className="edit-slider-row">
      <div className="edit-slider-label">
        <span className="edit-slider-icon">{icon}</span>
        <span>{label}</span>
        <span className={`edit-slider-val${isDefault ? ' edit-slider-val-default' : ''}`}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <input
        type="range"
        className="edit-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function ImageEditPanel({ imageUrl, imageTitle }: ImageEditPanelProps) {
  const [adj, setAdj] = useState<Adjustments>(DEFAULT_ADJ);
  const [preset, setPreset] = useState<FilterPreset>('none');
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const cssFilter = buildFilter(adj, preset);
  const cssTransform = [
    `rotate(${rotation}deg)`,
    flipH ? 'scaleX(-1)' : '',
    flipV ? 'scaleY(-1)' : '',
  ].filter(Boolean).join(' ') || 'none';

  const isDefault =
    adj.brightness === 0 && adj.contrast === 0 &&
    adj.saturation === 0 && adj.blur === 0 &&
    preset === 'none' && rotation === 0 && !flipH && !flipV;

  const reset = () => {
    setAdj(DEFAULT_ADJ);
    setPreset('none');
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  };

  const setAdjKey = useCallback((key: keyof Adjustments, value: number) => {
    setAdj((prev) => ({ ...prev, [key]: value }));
  }, []);

  const downloadEdited = useCallback(async () => {
    if (!imgRef.current || !imageLoaded) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const img = imgRef.current;
      const canvas = document.createElement('canvas');

      // Account for rotation (90/270 swap dims)
      const isOdd90 = Math.abs(rotation) % 180 !== 0;
      canvas.width  = isOdd90 ? img.naturalHeight : img.naturalWidth;
      canvas.height = isOdd90 ? img.naturalWidth  : img.naturalHeight;

      const ctx = canvas.getContext('2d')!;

      // Apply CSS filter equivalent via canvas
      ctx.filter = cssFilter;

      // Transform
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error('Canvas export failed')), 'image/jpeg', 0.92)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${imageTitle ?? 'edited'}-edited.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      setDownloadError(
        msg.includes('tainted') || msg.includes('security') || msg.includes('CORS')
          ? 'Download blocked by CORS — image served without cross-origin headers'
          : msg,
      );
    } finally {
      setDownloading(false);
    }
  }, [cssFilter, rotation, flipH, flipV, imageLoaded, imageTitle]);

  return (
    <div className="edit-panel">
      {/* Panel header */}
      <div className="edit-panel-head">
        <div className="edit-panel-label">Image Edit</div>
        <p className="edit-panel-sub">Client-side non-destructive adjustments</p>
      </div>

      {/* Preview */}
      <div className="edit-preview-wrap">
        <div className="edit-preview-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Edit preview"
            className="edit-preview-img"
            style={{ filter: cssFilter, transform: cssTransform }}
            onLoad={() => setImageLoaded(true)}
            crossOrigin="anonymous"
          />
        </div>
      </div>

      <div className="edit-controls">
        {/* Filter presets */}
        <div className="edit-section">
          <div className="edit-section-label">Filters</div>
          <div className="edit-presets">
            {FILTER_PRESETS.map((f) => (
              <button
                key={f.id}
                className={`edit-preset-btn${preset === f.id ? ' active' : ''}`}
                onClick={() => setPreset(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Adjustments */}
        <div className="edit-section">
          <div className="edit-section-label">Adjustments</div>
          <SliderRow
            label="Brightness" icon={<SunMedium size={11} />}
            value={adj.brightness} min={-100} max={100}
            onChange={(v) => setAdjKey('brightness', v)}
          />
          <SliderRow
            label="Contrast" icon={<Contrast size={11} />}
            value={adj.contrast} min={-100} max={100}
            onChange={(v) => setAdjKey('contrast', v)}
          />
          <SliderRow
            label="Saturation" icon={<Droplets size={11} />}
            value={adj.saturation} min={-100} max={100}
            onChange={(v) => setAdjKey('saturation', v)}
          />
          <SliderRow
            label="Blur" icon={<Wind size={11} />}
            value={adj.blur} min={0} max={10} step={1}
            onChange={(v) => setAdjKey('blur', v)}
          />
        </div>

        {/* Transform */}
        <div className="edit-section">
          <div className="edit-section-label">Transform</div>
          <div className="edit-transform-row">
            <button
              className="edit-transform-btn"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              title="Rotate 90° counter-clockwise"
            >
              <RotateCcw size={13} />
              <span>CCW</span>
            </button>
            <button
              className="edit-transform-btn"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="Rotate 90° clockwise"
            >
              <RotateCw size={13} />
              <span>CW</span>
            </button>
            <button
              className={`edit-transform-btn${flipH ? ' edit-transform-active' : ''}`}
              onClick={() => setFlipH((v) => !v)}
              title="Flip horizontal"
            >
              <FlipHorizontal2 size={13} />
              <span>Flip H</span>
            </button>
            <button
              className={`edit-transform-btn${flipV ? ' edit-transform-active' : ''}`}
              onClick={() => setFlipV((v) => !v)}
              title="Flip vertical"
            >
              <FlipVertical2 size={13} />
              <span>Flip V</span>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="edit-actions">
          <motion.button
            className="edit-download-btn"
            onClick={downloadEdited}
            disabled={downloading || !imageLoaded}
            whileTap={{ scale: 0.95 }}
          >
            <Download size={12} />
            {downloading ? 'Preparing…' : 'Download edited'}
          </motion.button>

          {!isDefault && (
            <button className="edit-reset-btn" onClick={reset}>
              <RefreshCcw size={11} />
              Reset
            </button>
          )}
        </div>

        {downloadError && (
          <p className="edit-download-error">{downloadError}</p>
        )}
      </div>
    </div>
  );
}
