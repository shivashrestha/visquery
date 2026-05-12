'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react';
import type { SearchResultItem, FilterState } from '@/lib/types';
import BuildingCard from './BuildingCard';
import RowCard from './RowCard';
import FilterSidebar from './FilterSidebar';
import SearchBar from './SearchBar';

interface ResultsViewProps {
  title?: string | null;
  subtitle?: string;
  headerAction?: React.ReactNode;
  items: SearchResultItem[];
  allItems?: SearchResultItem[];
  loading?: boolean;
  filters: FilterState;
  onFilterChange: (f: FilterState) => void;
  activeFilterCount: number;
  onOpen: (item: SearchResultItem) => void;
  favs: Record<string, boolean>;
  onFav: (item: SearchResultItem) => void;
  showAISummary?: boolean;
  query?: string;
  onSearch?: (q: string, imageId?: string) => void;
  committed?: string;
  queryTerms?: string[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

function SkeletonGrid() {
  return (
    <div className="grid" style={{ opacity: 0.6 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="card-img" style={{ aspectRatio: '4/3', borderRadius: 'var(--r)' }} />
          <div className="skeleton-line" style={{ width: '70%' }} />
          <div className="skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export default function ResultsView({
  title,
  subtitle,
  headerAction,
  items,
  allItems,
  loading = false,
  filters,
  onFilterChange,
  activeFilterCount,
  onOpen,
  favs,
  onFav,
  showAISummary = false,
  query = '',
  onSearch,
  committed = '',
  queryTerms = [],
  hasMore = false,
  onLoadMore,
}: ResultsViewProps) {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  return (
    <div className="results-shell">
      {/* Desktop sidebar */}
      <FilterSidebar
        filters={filters}
        onChange={onFilterChange}
        activeCount={activeFilterCount}
        corpus={allItems ?? items}
      />

      {/* Mobile filter overlay */}
      <div
        className={`sidebar-overlay${filterDrawerOpen ? ' is-open' : ''}`}
        onClick={() => setFilterDrawerOpen(false)}
      />
      <div className={`sidebar-drawer${filterDrawerOpen ? ' is-open' : ''}`}>
        <div className="sidebar-drawer-handle">
          <span>Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
          <button
            className="sidebar-drawer-close"
            onClick={() => setFilterDrawerOpen(false)}
            aria-label="Close filters"
          >
            <X size={14} />
          </button>
        </div>
        <FilterSidebar
          filters={filters}
          onChange={onFilterChange}
          activeCount={activeFilterCount}
          corpus={allItems ?? items}
        />
      </div>

      <main className="results-main fade-in" key={committed + (title ?? '')}>
        {/* Compact search bar */}
        {onSearch && (
          <div style={{ marginBottom: 18 }}>
            <SearchBar
              onSearch={onSearch}
              loading={loading}
              initialQuery={query}
            />
          </div>
        )}

        {/* Results bar */}
        <div className="results-bar">
          <div className="query-echo">
            <div className="lbl">{title ? 'View' : 'Semantic results for'}</div>
            <p className="q">{title ?? `"${committed}"`}</p>
            {subtitle && (
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="results-meta">
            {headerAction && headerAction}
            {/* Mobile filter button */}
            <button
              className={`mobile-filter-btn${activeFilterCount > 0 ? ' has-active' : ''}`}
              onClick={() => setFilterDrawerOpen(true)}
              aria-label="Open filters"
            >
              <SlidersHorizontal size={11} />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <span>{loading ? '…' : `${items.length} results`}</span>
            <div className="view-toggle">
              <button
                className={view === 'grid' ? 'on' : ''}
                onClick={() => setView('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid size={12} />
              </button>
              <button
                className={view === 'list' ? 'on' : ''}
                onClick={() => setView('list')}
                aria-label="List view"
              >
                <List size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && items.length === 0 && <SkeletonGrid />}

        {/* Empty */}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ink-muted)' }}>
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '1.4rem', color: 'var(--ink-soft)', margin: 0 }}>
              No results found
            </p>
            <p style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Try different keywords, adjust filters, or search by image
            </p>
          </div>
        )}

        {/* Grid / list */}
        {items.length > 0 && (
          <AnimatePresence mode="wait">
            {view === 'grid' ? (
              <motion.div
                key="grid"
                className="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {items.map((item, i) => (
                  <BuildingCard
                    key={item.image_id}
                    result={item}
                    onClick={onOpen}
                    onFav={onFav}
                    fav={!!favs[item.image_id]}
                    queryTerms={queryTerms}
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
                {items.map((item, i) => (
                  <RowCard
                    key={item.image_id}
                    result={item}
                    onClick={onOpen}
                    queryTerms={queryTerms}
                    index={i}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Load more */}
        {hasMore && items.length > 0 && !loading && onLoadMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <button className="btn-ghost" onClick={onLoadMore}>
              Load more
            </button>
          </div>
        )}

        {/* More loading skeletons */}
        {loading && items.length > 0 && (
          <div style={{ opacity: 0.5, marginTop: 20 }}>
            <SkeletonGrid />
          </div>
        )}

      </main>
    </div>
  );
}
