'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ImagePlus, Loader2 } from 'lucide-react';
import ImageSearchModal from './ImageSearchModal';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onImageSearch?: (file: File) => void;
  loading?: boolean;
  initialQuery?: string;
  large?: boolean;
}

export default function SearchBar({
  onSearch,
  onImageSearch,
  loading = false,
  initialQuery = '',
  large = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;
      onSearch(query);
    },
    [query, onSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSubmit();
    },
    [handleSubmit],
  );

  const clearAll = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const hasContent = query.trim();
  const isActive = loading;

  return (
    <>
      <form onSubmit={handleSubmit} className="relative w-full">
        <div
          className="relative flex items-center gap-2 transition-all"
          style={{
            padding: large ? '10px 10px 10px 20px' : '8px 8px 8px 12px',
            border: `1px solid ${focused ? 'var(--ink)' : 'var(--line)'}`,
            borderRadius: '20px',
            background: '#ffffff',
            boxShadow: focused ? '0 0 0 3px rgba(61, 116, 189, 0.08)' : 'none',
            transition: 'border-color .2s, box-shadow .2s',
          }}
        >
          {isActive ? (
            <Loader2
              className="flex-shrink-0 animate-spin"
              style={{
                width: large ? '18px' : '15px',
                height: large ? '18px' : '15px',
                color: 'var(--accent)',
              }}
            />
          ) : (
            <Search
              className="flex-shrink-0"
              style={{
                width: large ? '18px' : '15px',
                height: large ? '18px' : '15px',
                color: 'var(--ink-muted)',
              }}
            />
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              large
                ? 'Describe a style, material, structure…'
                : 'Search buildings…'
            }
            className="flex-1 bg-transparent outline-none"
            style={{
              fontSize: large ? '16px' : '0.875rem',
              fontFamily: large ? 'var(--mono)' : 'var(--sans)',
              padding: large ? '10px 8px' : '0',
              color: 'var(--ink)',
              letterSpacing: large ? '0.01em' : '0',
            }}
            aria-label="Search query"
            autoComplete="off"
            spellCheck={false}
          />

          <div className="flex items-center gap-1 flex-shrink-0">
            <AnimatePresence>
              {hasContent && (
                <motion.button
                  type="button"
                  onClick={clearAll}
                  className="p-1 rounded-sm transition-colors"
                  style={{ color: 'var(--ink-faint)', background: 'none', border: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-faint)')}
                  aria-label="Clear search"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>

            {onImageSearch && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="p-1 rounded-sm transition-colors"
                style={{ color: 'var(--ink-muted)', background: 'none', border: 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-muted)')}
                aria-label="Search by image"
                title="Search by uploading an image"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
            )}

            <motion.button
              type="submit"
              disabled={!hasContent || isActive}
              className={large ? 'p-2 sm:px-[22px] sm:py-[11px]' : ''}
              style={{
                fontSize: large ? '13px' : '10px',
                fontWeight: '500',
                letterSpacing: large ? '0.02em' : '0.10em',
                textTransform: large ? 'none' : 'uppercase',
                fontFamily: large ? 'var(--sans)' : 'var(--mono)',
                padding: large ? undefined : '6px 12px',
                borderRadius: '20px',
                background: hasContent && !isActive ? 'var(--ink)' : 'var(--line)',
                color: hasContent && !isActive ? '#FFFFFF' : 'var(--ink-muted)',
                border: 'none',
                cursor: hasContent && !isActive ? 'pointer' : 'not-allowed',
                transition: 'opacity .15s',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: hasContent && !isActive ? 1 : 0.5,
                whiteSpace: 'nowrap',
              }}
              whileHover={hasContent && !isActive ? { opacity: 0.85 } : {}}
              whileTap={hasContent && !isActive ? { scale: 0.98 } : {}}
            >
              <Search className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">{large ? 'Search' : 'Search'}</span>
            </motion.button>
          </div>
        </div>
      </form>

      {onImageSearch && (
        <ImageSearchModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSearch={(file) => {
            onImageSearch(file);
          }}
        />
      )}
    </>
  );
}
