'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Header, { type ViewName } from './components/Header';
import PrivacyModal from './components/PrivacyModal';
import SearchBar from './components/SearchBar';
import ResultsView from './components/ResultsView';
import DetailView from './components/DetailView';
import CollectionsView from './components/CollectionsView';
import LibraryView from './components/LibraryView';
import { useSearch } from '@/lib/hooks';
import type { SearchResultItem } from '@/lib/types';

type AppView =
  | { name: 'home' }
  | { name: 'results' }
  | { name: 'library' }
  | { name: 'collections' }
  | { name: 'detail'; item: SearchResultItem; from: 'results' | 'library' | 'collections' };

const heroVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 0.61, 0.36, 1] } },
};
const chipsVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.45 } },
};

export default function HomePage() {
  const [view, setView] = useState<AppView>({ name: 'home' });
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Favorites persisted in localStorage
  const [favItems, setFavItems] = useState<Record<string, SearchResultItem>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem('visquery_favs');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const favs = useMemo(() => {
    const out: Record<string, boolean> = {};
    Object.keys(favItems).forEach((k) => { out[k] = true; });
    return out;
  }, [favItems]);

  const toggleFav = useCallback((item: SearchResultItem) => {
    setFavItems((prev) => {
      const next = { ...prev };
      if (next[item.image_id]) {
        delete next[item.image_id];
      } else {
        next[item.image_id] = item;
      }
      try { localStorage.setItem('visquery_favs', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const {
    query,
    results,
    loading,
    error,
    filters,
    submit,
    submitByImage,
    loadMore,
    updateFilters,
    clearSearch,
    activeFilterCount,
  } = useSearch();

  const handleSearch = useCallback((q: string) => {
    submit(q);
    setView({ name: 'results' });
  }, [submit]);

  const handleImageSearch = useCallback((file: File) => {
    setView({ name: 'results' });
    submitByImage(file);
  }, [submitByImage]);

  const handleOpen = useCallback((item: SearchResultItem) => {
    const from =
      view.name === 'library' ? 'library'
      : view.name === 'collections' ? 'collections'
      : 'results';
    setView({ name: 'detail', item, from });
  }, [view.name]);

  const handleBack = useCallback(() => {
    if (view.name === 'detail') {
      const from = view.from;
      if (from === 'library') setView({ name: 'library' });
      else if (from === 'collections') setView({ name: 'collections' });
      else setView({ name: 'results' });
    } else {
      setView({ name: 'home' });
    }
  }, [view]);

  const handleNav = useCallback((name: ViewName) => {
    if (name === 'home') {
      clearSearch();
      setView({ name: 'home' });
    } else if (name === 'results') {
      setView({ name: 'results' });
    } else if (name === 'library') {
      setView({ name: 'library' });
    } else if (name === 'collections') {
      setView({ name: 'collections' });
    }
  }, [clearSearch]);

  const allResults = results?.results ?? [];
  const queryTerms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);

  // Related items for detail view
  const relatedItems = useMemo(() => {
    if (view.name !== 'detail') return [];
    const { item } = view;
    return allResults
      .filter(
        (r) =>
          r.image_id !== item.image_id &&
          (r.metadata.typology?.some((t) => item.metadata.typology?.includes(t)) ||
            r.metadata.materials?.some((m) => item.metadata.materials?.includes(m))),
      )
      .slice(0, 6);
  }, [view, allResults]);

  const viewName: ViewName =
    view.name === 'detail' ? view.from : view.name;

  return (
    <div className="app" data-theme="monograph">
      <Header
        view={viewName}
        onNav={handleNav}
        resultCount={view.name === 'results' ? allResults.length : undefined}
      />

      <AnimatePresence mode="wait">
        {/* ── Home / Hero ── */}
        {view.name === 'home' && (
          <motion.main
            key="home"
            className="hero"
            variants={heroVariants}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
          >
            <motion.div variants={heroItem} style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Image
                src="/app-logo.png"
                alt="Visquery"
                width={300}
                height={300}
                quality={100}
                unoptimized
                style={{ objectFit: 'contain' }}
                priority
              />
            </motion.div>

            <motion.h1 variants={heroItem}>
              Find architecture <em>by description,</em>
              <br />
              <em>by image,</em> by feeling.
            </motion.h1>
            <motion.p className="lede" variants={heroItem}>
              Describe the style you almost remember — the form, the ornament, the period.
              Visquery searches indexed buildings and explains what it finds.
            </motion.p>

            <motion.div className="search-wrap" variants={heroItem}>
              <SearchBar
                onSearch={handleSearch}
                onImageSearch={handleImageSearch}
                loading={loading}
                initialQuery=""
                large
              />
              <motion.div className="suggest-row" variants={chipsVariants}>
                {EXAMPLE_QUERIES.map((q) => (
                  <motion.button
                    key={q.text}
                    className="suggest-chip"
                    variants={heroItem}
                    whileHover={{ y: -2, transition: { duration: 0.15 } }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSearch(q.text)}
                  >
                    {q.text}
                    <span className="style-tag">{q.style}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>

            <div className="landing-footer">
              <span>© {new Date().getFullYear()} Visquery · visquery.com</span>
              <button className="landing-footer-link" onClick={() => setPrivacyOpen(true)}>
                Privacy Policy
              </button>
            </div>

          </motion.main>
        )}

        {/* ── Search results ── */}
        {view.name === 'results' && (
          <motion.div
            key="results"
            style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          >
            {error && (
              <div style={{ padding: '10px 28px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontFamily: 'var(--mono)', fontSize: 11, color: '#b91c1c' }}>
                {error}
              </div>
            )}
            <ResultsView
              items={allResults}
              allItems={allResults}
              loading={loading}
              filters={filters}
              onFilterChange={updateFilters}
              activeFilterCount={activeFilterCount}
              onOpen={handleOpen}
              favs={favs}
              onFav={toggleFav}
              showAISummary
              query={query}
              onSearch={handleSearch}
              committed={query}
              queryTerms={queryTerms}
              hasMore={results ? allResults.length > 0 && allResults.length % 30 === 0 : false}
              onLoadMore={loadMore}
            />
          </motion.div>
        )}

        {/* ── Library ── */}
        {view.name === 'library' && (
          <motion.div
            key="library"
            style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          >
            <LibraryView
              onOpen={handleOpen}
              favs={favs}
              onFav={toggleFav}
            />
          </motion.div>
        )}

        {/* ── Collections ── */}
        {view.name === 'collections' && (
          <motion.div
            key="collections"
            style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          >
            <CollectionsView
              favItems={Object.values(favItems)}
              onOpen={handleOpen}
              favs={favs}
              onFav={toggleFav}
            />
          </motion.div>
        )}

        {/* ── Detail ── */}
        {view.name === 'detail' && (
          <motion.div
            key={`detail-${view.item.image_id}`}
            style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25 }}
          >
            <DetailView
              item={view.item}
              related={relatedItems}
              onBack={handleBack}
              favs={favs}
              onFav={toggleFav}
              onOpen={handleOpen}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </div>
  );
}

const EXAMPLE_QUERIES: { text: string; style: string }[] = [
  { text: 'Art Deco architecture', style: 'Deco' },
  { text: 'Bauhaus architecture', style: 'Bauhaus' },
  { text: 'Gothic architecture', style: 'Gothic' },
  { text: 'Deconstructivism', style: 'Decon' },
  { text: 'Byzantine architecture', style: 'Byzantine' },
  { text: 'Art Nouveau architecture', style: 'Nouveau' },
];
