'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ImagePlus, Loader2 } from 'lucide-react';

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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    setUploading(true);
    onImageSearch?.(file);
    setUploading(false);
  }, [onImageSearch]);

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

  const clearImage = useCallback(() => {
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const clearAll = useCallback(() => {
    setQuery('');
    clearImage();
    inputRef.current?.focus();
  }, [clearImage]);

  const isActive = loading || uploading;
  const hasContent = query.trim();

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div
        className="relative flex items-center gap-2 transition-all"
        style={{
          padding: large ? '14px 14px 14px 18px' : '10px 10px 10px 14px',
          border: `1px solid ${dragOver ? 'var(--accent)' : focused ? 'var(--ink-soft)' : 'var(--line)'}`,
          borderRadius: '3px',
          background: dragOver ? 'var(--accent-soft)' : 'var(--paper)',
          boxShadow: focused ? '0 1px 0 var(--ink-faint)' : 'none',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
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

        <AnimatePresence>
          {imagePreview && (
            <motion.div
              className="relative flex-shrink-0"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <img
                src={imagePreview}
                alt="Search image"
                className="object-cover rounded-sm"
                style={{
                  width: '30px',
                  height: '30px',
                  border: '1px solid var(--line)',
                }}
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full"
                style={{ background: 'var(--ink)', color: 'var(--paper)' }}
                aria-label="Remove image"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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
              ? 'Describe a style, material, structure or drop an image…'
              : 'Search buildings…'
          }
          className="flex-1 bg-transparent outline-none font-serif"
          style={{
            fontSize: large ? '1.05rem' : '0.9rem',
            color: 'var(--ink)',
          }}
          aria-label="Search query"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center gap-1 flex-shrink-0">
          {hasContent && (
            <button
              type="button"
              onClick={clearAll}
              className="p-1 rounded-sm transition-colors"
              style={{ color: 'var(--ink-faint)', background: 'none', border: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-faint)')}
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-1 rounded-sm transition-colors"
            style={{ color: 'var(--ink-muted)', background: 'none', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-muted)')}
            aria-label="Upload image for visual search"
            title="Drop or click to search by image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <motion.button
            type="submit"
            disabled={!hasContent || isActive}
            className="font-mono uppercase rounded-sm transition-colors"
            style={{
              fontSize: '10px',
              letterSpacing: '0.12em',
              padding: large ? '8px 16px' : '6px 12px',
              background: hasContent && !isActive ? 'var(--ink)' : 'var(--line)',
              color: hasContent && !isActive ? 'var(--paper)' : 'var(--ink-muted)',
              border: 'none',
              cursor: hasContent && !isActive ? 'pointer' : 'not-allowed',
            }}
            whileHover={hasContent && !isActive ? { scale: 1.02 } : {}}
            whileTap={hasContent && !isActive ? { scale: 0.97 } : {}}
          >
            Search
          </motion.button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="sr-only"
        aria-hidden="true"
      />

      <AnimatePresence>
        {dragOver && (
          <motion.div
            className="absolute inset-0 pointer-events-none flex items-center justify-center rounded-sm"
            style={{
              border: '2px dashed var(--accent)',
              background: 'var(--accent-soft)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span
              className="font-mono uppercase"
              style={{ fontSize: '11px', letterSpacing: '0.14em', color: 'var(--accent)' }}
            >
              Drop image to search
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
