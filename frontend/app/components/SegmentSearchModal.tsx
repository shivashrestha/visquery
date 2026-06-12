'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import type { SegmentSearchResultItem } from '@/lib/api';

interface SegmentSearchModalProps {
  label: string | null;
  cropUrl: string;
  items: SegmentSearchResultItem[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpen: (item: SearchResultItem) => void;
}

/**
 * Overlay dialog for component-level search. The detail view (and its
 * segmentation panel state) stays mounted underneath, so "Back" returns
 * the user to the same segmented image to try another region.
 * Desktop: query crop on the left, similar components on the right.
 * Mobile: crop on top, results listed below.
 */
export default function SegmentSearchModal({
  label,
  cropUrl,
  items,
  loading,
  error,
  onClose,
  onOpen,
}: SegmentSearchModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const displayLabel = label?.toLowerCase() ?? 'components';

  return (
    <AnimatePresence>
      <motion.div
        className="seg-search-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="seg-search-modal"
          initial={{ opacity: 0, scale: 0.97, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 18 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="seg-search-header">
            <button className="seg-search-back" onClick={onClose} title="Back to segmentation (Esc)">
              <ArrowLeft size={13} />
              Back to segments
            </button>
            <div className="seg-search-title">
              <Search size={12} />
              <span>Similar {displayLabel}</span>
              {!loading && <span className="seg-search-count">{items.length} matches</span>}
            </div>
            <button className="seg-search-close" onClick={onClose}><X size={15} /></button>
          </div>

          {/* Body: query pane + results */}
          <div className="seg-search-body">
            <div className="seg-search-query">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cropUrl} alt="Query crop" className="seg-search-query-img" />
            </div>

            <div className="seg-search-results">
              {loading && (
                <div className="seg-search-state">
                  <div className="seg-loading-spinner" />
                  <p>Searching components&hellip;</p>
                </div>
              )}

              {!loading && error && (
                <div className="seg-search-state">
                  <p className="seg-search-error">{error}</p>
                </div>
              )}

              {!loading && !error && items.length === 0 && (
                <div className="seg-search-state">
                  <p>No similar components found.</p>
                  <span>Try a larger or more distinct region.</span>
                </div>
              )}

              {!loading && items.length > 0 && (
                <div className="seg-search-grid">
                  {items.map((item) => (
                    <button
                      key={item.image_id}
                      className="seg-search-card"
                      onClick={() => onOpen(item)}
                      title={item.metadata.name ?? ''}
                    >
                      <div className="seg-search-card-img">
                        {/* Matched component crop — direct visual comparison with the query */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.segment?.crop_url ?? item.image_url}
                          alt={item.metadata.name ?? 'Building'}
                          loading="lazy"
                        />
                        {item.segment?.crop_url && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={item.image_url}
                            alt=""
                            className="seg-search-card-parent"
                            loading="lazy"
                          />
                        )}
                      </div>
                      <p className="seg-search-card-name">{item.metadata.name ?? 'Untitled'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
