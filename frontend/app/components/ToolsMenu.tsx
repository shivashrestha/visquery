'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, ScanSearch, Sliders, X } from 'lucide-react';

export type RightPanelMode = 'rag' | 'segment' | 'edit';

export interface ToolsMenuAction {
  label: string;
  desc: string;
  Icon: React.ElementType;
  onClick: () => void;
}

interface ToolsMenuProps {
  activeMode?: RightPanelMode;
  onSelect?: (mode: RightPanelMode) => void;
  /** Extra one-shot actions (e.g. "Report from selection"); shown below mode tools. */
  actions?: ToolsMenuAction[];
}

const TOOLS: { mode: RightPanelMode; label: string; desc: string; Icon: React.ElementType }[] = [
  {
    mode: 'segment',
    label: 'Segmentation',
    desc: 'Detect & isolate objects using FastSAM',
    Icon: ScanSearch,
  },
  {
    mode: 'edit',
    label: 'Image Edit',
    desc: 'Adjust brightness, contrast, filters & more',
    Icon: Sliders,
  },
];

export default function ToolsMenu({ activeMode = 'rag', onSelect, actions = [] }: ToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const isToolActive = activeMode !== 'rag';

  return (
    <div className="tools-menu-root" ref={ref}>
      <motion.button
        className={`btn-ghost tools-trigger${isToolActive ? ' tools-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.92 }}
        title="Image tools"
      >
        <Wrench size={12} />
        Tools
        {isToolActive && (
          <span className="tools-active-dot" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="tools-dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="tools-dropdown-header">
              <span className="tools-dropdown-label">Image Tools</span>
              <button className="tools-close" onClick={() => setOpen(false)}>
                <X size={11} />
              </button>
            </div>

            {onSelect && TOOLS.map(({ mode, label, desc, Icon }) => {
              const active = activeMode === mode;
              return (
                <button
                  key={mode}
                  className={`tools-option${active ? ' tools-option-active' : ''}`}
                  onClick={() => {
                    onSelect!(active ? 'rag' : mode);
                    setOpen(false);
                  }}
                >
                  <span className="tools-option-icon">
                    <Icon size={14} />
                  </span>
                  <span className="tools-option-text">
                    <span className="tools-option-name">{label}</span>
                    <span className="tools-option-desc">{desc}</span>
                  </span>
                  {active && <span className="tools-option-check">✓</span>}
                </button>
              );
            })}

            {actions.map(({ label, desc, Icon, onClick }) => (
              <button
                key={label}
                className="tools-option"
                onClick={() => { onClick(); setOpen(false); }}
              >
                <span className="tools-option-icon">
                  <Icon size={14} />
                </span>
                <span className="tools-option-text">
                  <span className="tools-option-name">{label}</span>
                  <span className="tools-option-desc">{desc}</span>
                </span>
              </button>
            ))}

            {onSelect && isToolActive && (
              <button
                className="tools-reset"
                onClick={() => { onSelect('rag'); setOpen(false); }}
              >
                ← Back to AI Chat
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
