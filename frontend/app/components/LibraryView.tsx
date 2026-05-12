'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, List, ArrowUpDown, RefreshCw, Heart } from 'lucide-react';
import type { SearchResultItem, FilterState } from '@/lib/types';
import type { LibraryResponse } from '@/lib/api';
import { listImages } from '@/lib/api';
import RowCard from './RowCard';
import FilterSidebar from './FilterSidebar';

interface PinterestCardProps {
  result: SearchResultItem;
  onClick: (r: SearchResultItem) => void;
  onFav: (r: SearchResultItem) => void;
  fav: boolean;
  index: number;
}

function PinterestCard({ result, onClick, onFav, fav, index }: PinterestCardProps) {
  const { metadata, source } = result;
  const title = source.title || metadata.architect;

  return (
    <motion.article
      className="pin-card"
      onClick={() => onClick(result)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.3), ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div className="pin-img">
        {result.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.image_url}
            alt={metadata.architect ?? ''}
            loading="lazy"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        ) : (
          <div style={{ aspectRatio: '4/3', background: 'var(--bg-soft)' }} />
        )}
        <motion.button
          className={`card-fav pin-fav${fav ? ' on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onFav(result); }}
          whileTap={{ scale: 0.85 }}
          animate={fav ? { scale: [1, 1.28, 1] } : { scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Heart size={13} fill={fav ? 'currentColor' : 'none'} />
        </motion.button>
      </div>
      <div className="pin-meta">
        {title && <p className="pin-title">{title}</p>}
        {(metadata.location_city || metadata.location_country) && (
          <p className="pin-sub">
            {[metadata.location_city, metadata.location_country].filter(Boolean).join(', ')}
            {metadata.year_built ? ` · ${metadata.year_built}` : ''}
          </p>
        )}
        {result.tags && result.tags.length > 0 && (
          <div className="card-tags" style={{ marginTop: 4 }}>
            {result.tags.slice(0, 3).map((t) => (
              <span key={t} className="card-tag">{t}</span>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  );
}

type SortKey = 'created_at_desc' | 'created_at_asc' | 'year_desc' | 'year_asc';

const SORT_LABELS: Record<SortKey, string> = {
  created_at_desc: 'Newest added',
  created_at_asc: 'Oldest added',
  year_desc: 'Year ↓',
  year_asc: 'Year ↑',
};

const PAGE_SIZE = 40;

interface LibraryViewProps {
  onOpen: (item: SearchResultItem) => void;
  favs: Record<string, boolean>;
  onFav: (item: SearchResultItem) => void;
}

function SkeletonGrid() {
  return (
    <div className="grid" style={{ opacity: 0.6 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="card-img" style={{ aspectRatio: '4/3', borderRadius: 'var(--r)' }} />
          <div className="skeleton-line" style={{ width: '70%' }} />
          <div className="skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export default function LibraryView({ onOpen, favs, onFav }: LibraryViewProps) {
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [sort, setSort] = useState<SortKey>('created_at_desc');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sortOpen, setSortOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    period: [1900, 2030],
    typology: [],
    material: [],
    structural_system: [],
    climate_zone: [],
    style: [],
    location_country: '',
  });

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (newSkip: number, newSort: SortKey, replace: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    replace ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const data: LibraryResponse = await listImages(newSkip, PAGE_SIZE, newSort);
      setTotal(data.total);
      setItems(prev => replace ? data.results : [...prev, ...data.results]);
      setSkip(newSkip + data.results.length);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setSkip(0);
    load(0, sort, true);
  }, [sort, load]);

  const handleLoadMore = () => {
    load(skip, sort, false);
  };

  const handleSortChange = (s: SortKey) => {
    setSortOpen(false);
    setSort(s);
  };

  // Client-side filter application
  const filtered = items.filter(item => {
    const m = item.metadata;
    if (filters.typology.length > 0 && !filters.typology.some(t => m.typology?.includes(t))) return false;
    if (filters.material.length > 0 && !filters.material.some(t => m.materials?.includes(t))) return false;
    if (filters.structural_system.length > 0 && m.structural_system && !filters.structural_system.includes(m.structural_system)) return false;
    if (filters.climate_zone.length > 0 && m.climate_zone && !filters.climate_zone.includes(m.climate_zone)) return false;
    if (filters.location_country && m.location_country !== filters.location_country) return false;
    if (m.year_built) {
      if (m.year_built < filters.period[0] || m.year_built > filters.period[1]) return false;
    }
    return true;
  });

  const hasMore = items.length < total;

  return (
    <div className="results-shell">
      <FilterSidebar
        filters={filters}
        onChange={setFilters}
        activeCount={
          filters.typology.length +
          filters.material.length +
          filters.structural_system.length +
          filters.climate_zone.length +
          filters.style.length +
          (filters.location_country ? 1 : 0)
        }
        corpus={items}
      />

      <main className="results-main fade-in">
        {/* Header bar */}
        <div className="results-bar">
          <div className="query-echo">
            <div className="lbl">View</div>
            <p className="q">Library</p>
            <p style={{ margin: '4px 0 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-muted)' }}>
              {loading
                ? 'Loading…'
                : `${filtered.length}${filtered.length < total ? ` of ${total}` : ''} image${total !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="results-meta">
            {/* Sort dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn-ghost"
                onClick={() => setSortOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <ArrowUpDown size={11} />
                {SORT_LABELS[sort]}
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 4px)',
                      background: 'var(--paper)',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r)',
                      padding: '4px 0',
                      zIndex: 50,
                      minWidth: 140,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    }}
                  >
                    {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => handleSortChange(key)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 12px',
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: sort === key ? 'var(--accent)' : 'var(--ink)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* View toggle */}
            <div className="view-toggle">
              <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Grid view">
                <LayoutGrid size={12} />
              </button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="List view">
                <List size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '16px', color: 'var(--ink-muted)', fontFamily: 'var(--mono)', fontSize: 11 }}>
            Failed to load: {error}
            <button className="btn-ghost" onClick={() => load(0, sort, true)} style={{ marginLeft: 8 }}>
              <RefreshCw size={10} /> Retry
            </button>
          </div>
        )}

        {/* Initial loading */}
        {loading && <SkeletonGrid />}

        {/* Empty */}
        {!loading && filtered.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ink-muted)' }}>
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.4rem', color: 'var(--ink-soft)', margin: 0 }}>
              {total === 0 ? 'No images indexed yet' : 'No results match filters'}
            </p>
            <p style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {total === 0 ? 'Add images to get started' : 'Try clearing some filters'}
            </p>
          </div>
        )}

        {/* Grid / list */}
        {!loading && filtered.length > 0 && (
          <AnimatePresence mode="wait">
            {view === 'grid' ? (
              <motion.div
                key="grid"
                className="masonry-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {filtered.map((item, i) => (
                  <PinterestCard
                    key={item.image_id}
                    result={item}
                    onClick={onOpen}
                    onFav={onFav}
                    fav={!!favs[item.image_id]}
                    index={i}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                className="grid is-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {filtered.map((item, i) => (
                  <RowCard
                    key={item.image_id}
                    result={item}
                    onClick={onOpen}
                    queryTerms={[]}
                    index={i}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Load more */}
        {hasMore && !loading && !loadingMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <button className="btn-ghost" onClick={handleLoadMore}>
              Load {Math.min(PAGE_SIZE, total - items.length)} more
            </button>
          </div>
        )}

        {/* Load more skeleton */}
        {loadingMore && (
          <div style={{ opacity: 0.5, marginTop: 20 }}>
            <SkeletonGrid />
          </div>
        )}

      </main>
    </div>
  );
}
