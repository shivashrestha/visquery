'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';

export default function ImageFullscreen({ item, onClose }: { item: SearchResultItem; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.25, Math.min(8, s - e.deltaY * 0.001)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onPointerUp = () => { dragging.current = false; };

  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  const imgSrc = item.image_url || '';

  return (
    <motion.div
      className="fs-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="fs-toolbar">
        <button className="fs-btn" onClick={() => setScale((s) => Math.min(8, s + 0.25))} title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <span className="fs-scale">{Math.round(scale * 100)}%</span>
        <button className="fs-btn" onClick={() => setScale((s) => Math.max(0.25, s - 0.25))} title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button className="fs-btn" onClick={reset} title="Reset">
          <RotateCcw size={16} />
        </button>
        <button className="fs-btn fs-close" onClick={onClose} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
      <div
        ref={containerRef}
        className="fs-canvas"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt=""
          className="fs-img"
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: 'center',
          }}
        />
      </div>
    </motion.div>
  );
}
