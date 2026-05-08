'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, X, ImagePlus, Loader2 } from 'lucide-react';
import { uploadImage } from '@/lib/api';

interface SearchBarProps {
  onSearch: (query: string, imageId?: string) => void;
  loading?: boolean;
  initialQuery?: string;
  large?: boolean;
}

export default function SearchBar({
  onSearch,
  loading = false,
  initialQuery = '',
  large = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!query.trim() && !imageId) return;
      onSearch(query, imageId);
    },
    [query, imageId, onSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSubmit();
    },
    [handleSubmit],
  );

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const id = await uploadImage(file);
      setImageId(id);
    } catch {
      setImagePreview(null);
      setImageId(undefined);
    } finally {
      setUploading(false);
    }
  }, []);

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
    setImageId(undefined);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const clearAll = useCallback(() => {
    setQuery('');
    clearImage();
    inputRef.current?.focus();
  }, [clearImage]);

  const isActive = loading || uploading;
  const hasContent = query.trim() || imageId;

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div
        className={[
          'relative flex items-center gap-2 border rounded-sm transition-colors bg-white',
          large
            ? 'px-4 py-3.5 border-border focus-within:border-accent/60'
            : 'px-3 py-2 border-border focus-within:border-accent/60',
          dragOver ? 'border-accent bg-amber-50/50' : '',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {isActive ? (
          <Loader2
            className={`flex-shrink-0 animate-spin text-accent ${large ? 'w-5 h-5' : 'w-4 h-4'}`}
          />
        ) : (
          <Search
            className={`flex-shrink-0 text-muted ${large ? 'w-5 h-5' : 'w-4 h-4'}`}
          />
        )}

        {imagePreview && (
          <div className="relative flex-shrink-0">
            <img
              src={imagePreview}
              alt="Search image"
              className="w-8 h-8 object-cover rounded-sm border border-border"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-near-black text-white rounded-full flex items-center justify-center"
              aria-label="Remove image"
            >
              <X className="w-2 h-2" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            large
              ? 'Describe what you are looking for — curved facade, thick walls that become furniture...'
              : 'Search buildings...'
          }
          className={[
            'flex-1 bg-transparent outline-none text-near-black placeholder:text-muted/60',
            large ? 'text-base' : 'text-sm',
          ].join(' ')}
          aria-label="Search query"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center gap-1 flex-shrink-0">
          {hasContent && (
            <button
              type="button"
              onClick={clearAll}
              className="p-1 text-muted hover:text-near-black transition-colors rounded"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-1 text-muted hover:text-near-black transition-colors rounded"
            aria-label="Upload image for visual search"
            title="Drop or click to search by image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          <button
            type="submit"
            disabled={!hasContent || isActive}
            className={[
              'px-3 py-1 text-sm rounded-sm transition-colors font-medium',
              large ? 'px-4 py-1.5' : 'px-3 py-1',
              hasContent && !isActive
                ? 'bg-accent text-white hover:bg-accent-700'
                : 'bg-border text-muted cursor-not-allowed',
            ].join(' ')}
          >
            Search
          </button>
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

      {dragOver && (
        <div className="absolute inset-0 border-2 border-dashed border-accent rounded-sm pointer-events-none flex items-center justify-center bg-amber-50/30">
          <span className="text-sm text-accent font-medium">
            Drop image to search
          </span>
        </div>
      )}
    </form>
  );
}
