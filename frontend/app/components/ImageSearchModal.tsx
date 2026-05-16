'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ImagePlus, Upload, ShieldCheck } from 'lucide-react';

interface ImageSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSearch: (file: File) => void;
}

const MAX_BYTES = 20 * 1024 * 1024;

export default function ImageSearchModal({
  open,
  onClose,
  onSearch,
}: ImageSearchModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('File must be an image.');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError('File exceeds 20 MB limit.');
        return;
      }
      onSearch(file);
      onClose(); // full-screen overlay takes over immediately
    },
    [onSearch, onClose],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="img-search-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            className="img-search-modal"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {/* Header */}
            <div className="img-search-header">
              <div>
                <p className="img-search-eyebrow">Architectural Artifact Extraction Engine</p>
                <h3 className="img-search-title">Search by Image</h3>
              </div>
              <button
                className="img-search-close"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Drop zone */}
            <div
              className={`img-search-dropzone${dragOver ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="img-search-drop-inner">
                <div className="img-search-drop-icon">
                  <Upload size={22} />
                </div>
                <p className="img-search-drop-label">
                  Drop an architectural image here
                </p>
                <p className="img-search-drop-sub">
                  or click to browse — JPG, PNG, WebP up to 20 MB
                </p>
                <button
                  type="button"
                  className="img-search-browse-btn"
                  onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                >
                  <ImagePlus size={13} /> Browse files
                </button>
              </div>
            </div>

            <p className="img-search-privacy">
              <ShieldCheck size={11} />
              Your image is processed in memory only — never stored on our servers.
            </p>

            {error && (
              <p className="img-search-error">{error}</p>
            )}

            {/* Actions — cancel only */}
            <div className="img-search-actions">
              <button
                className="img-search-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </motion.div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
            aria-hidden="true"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
