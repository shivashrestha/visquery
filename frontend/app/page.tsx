'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Building2, Globe2 } from 'lucide-react';
import Header, { type ViewName } from './components/Header';
import VQLogo from './components/VQLogo';

import SiteFooter from './components/SiteFooter';
import SearchBar from './components/SearchBar';
import ResultsView from './components/ResultsView';
import DetailView from './components/DetailView';
import CollectionsView from './components/CollectionsView';
import LibraryView from './components/LibraryView';
import { useSearch } from '@/lib/hooks';
import type { SearchResultItem } from '@/lib/types';
import { analyzeEphemeral } from '@/lib/api';
import architectureStyles from './architecture_styles.json';

function shortStyleTag(style: string): string {
  return style
    .replace(/ architecture$/i, '')
    .replace(/ style$/i, '')
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

// ── Static plate showcase ──────────────────────────────
const SAMPLE_PLATES = [
  { img: '/etienne-chevalier-ZK75CjUSa8U-unsplash.jpg', name: 'Gothic', era: '1140–1500', region: 'Europe' },
  { img: '/kamal-alkhatib-dfTooNLNu6M-unsplash.jpg', name: 'Baroque', era: '1600–1750', region: 'Europe' },
  { img: '/hossein-nasr-8lBZWmYjymA-unsplash.jpg', name: 'Achaemenid', era: '550–330 BCE', region: 'Persia' },
  { img: '/biel-morro-d0xjEv-WJQk-unsplash.jpg', name: 'Modernist', era: '1920s–present', region: 'Global' },
  { img: '/jimmy-woo-_2aqusGbPO0-unsplash.jpg', name: 'Art Deco', era: '1920s–1940s', region: 'Americas' },
  { img: '/reid-bailey-NAn5nn_HBcc-unsplash.jpg', name: 'Beaux-Arts', era: '1830–1930', region: 'France & U.S.' },
  { img: '/teymur-mammadov-MX0BBSYGNZs-unsplash.jpg', name: 'Byzantine', era: '330–1453', region: 'E. Mediterranean' },
];

const EPOCH_GROUPS = [
  {
    id: 'classical',
    label: 'Historical & Classical',
    styles: ['Achaemenid', 'Ancient Egyptian', 'Byzantine', 'Romanesque', 'Gothic', 'Greek Revival'],
  },
  {
    id: 'renaissance',
    label: 'European & Renaissance',
    styles: ['Palladian', 'Baroque', 'Georgian', 'Beaux-Arts', 'Art Nouveau', 'Edwardian'],
  },
  {
    id: 'modern',
    label: 'Modern Movement',
    styles: ['Chicago school', 'Art Deco', 'Bauhaus', 'International style', 'Deconstructivism', 'Postmodern'],
  },
  {
    id: 'regional',
    label: 'Regional & Vernacular',
    styles: ['Colonial', 'Queen Anne', 'Craftsman', 'American Foursquare', 'Novelty'],
  },
];

// ── Atlas Section — CSS masonry with grayscale hover ───
function AtlasSection({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="atlas-section">
      <div className="atlas-inner">
        <div className="atlas-head">
          <div>
            <h2 className="atlas-title">The Atlas</h2>
            <p className="atlas-eyebrow">Recently classified precedents</p>
          </div>
          <button className="atlas-view-all" onClick={() => onSearch('architecture')}>
            View All Entries
          </button>
        </div>
        <div className="atlas-grid">
          {SAMPLE_PLATES.map((p) => (
            <article
              key={p.name}
              className="atlas-card"
              onClick={() => onSearch(p.name)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="atlas-card-img"
                src={p.img}
                alt={p.name}
                loading="lazy"
                decoding="async"
              />
              <div className="atlas-card-body">
                <div className="atlas-card-header">
                  <h4 className="atlas-card-title">{p.name}</h4>
                  <span className="atlas-style-badge">{shortStyleTag(p.name)}</span>
                </div>
                <div className="atlas-card-meta">
                  <div>
                    <p className="atlas-meta-key">Era</p>
                    <p className="atlas-meta-val">{p.era}</p>
                  </div>
                  <div>
                    <p className="atlas-meta-key">Region</p>
                    <p className="atlas-meta-val">{p.region}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Ask the Image Section ──────────────────────────────
function AskTheImageSection({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="ask-section">
      <div className="ask-inner">
        {/* Left: dark image with annotation overlay */}
        <div className="ask-image-wrap">
          <span className="ask-image-watermark">Visquery</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="ask-image"
            src="/hossein-nasr-8lBZWmYjymA-unsplash.jpg"
            alt="Achaemenid column detail"
            loading="lazy"
            decoding="async"
          />
          <div className="ask-annotation">
            <p className="ask-annotation-label">Detected Component</p>
            <p className="ask-annotation-name">Column Capital</p>
            <p className="ask-annotation-meta">
              Order: Achaemenid.<br />
              Material: Limestone.
            </p>
          </div>
        </div>

        {/* Right: content */}
        <div>
          <p className="ask-eyebrow">Interactive Knowledge</p>
          <h2 className="ask-heading">Ask the Image</h2>
          <p className="ask-desc">
            Query specific architectural elements in real-time. Our vision models
            don't just see the building, they understand the technical history
            behind every column and capital.
          </p>

          <div className="ask-chat">
            <div className="ask-chat-user">
              <div className="ask-chat-avatar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </div>
              <div className="ask-chat-bubble">
                &ldquo;What is the structural origin of this specific column capital?&rdquo;
              </div>
            </div>

            <div className="ask-chat-response">
              <p className="ask-chat-response-text">
                <span className="ask-chat-response-mark">✦</span>
                The Achaemenid order originated in Persia during the 6th century BCE under Cyrus the Great. These capitals are characterised by bull or griffin protomes - were used at Persepolis to carry heavy cedar beams, blending Egyptian, Ionic, and indigenous Persian traditions.
              </p>
              <button
                className="ask-chat-response-link"
                onClick={() => onSearch('Achaemenid architecture')}
              >
                Explore Precedents
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Value Props Section ────────────────────────────────
const VALUE_PROPS = [
  {
    icon: <Layers size={30} />,
    title: 'Style Classification',
    desc: 'Instant identification of stylistic periods from raw imagery across historical taxonomies.',
  },
  {
    icon: <Building2 size={30} />,
    title: 'Structural Analysis',
    desc: 'Component-level breakdown of load-bearing systems, ornamentation, and material composition.',
  },
  {
    icon: <Globe2 size={30} />,
    title: 'Precedent Mapping',
    desc: 'Connect visual forms across global regions and time periods to find architectural twins.',
  },
];

function ValuePropsSection() {
  return (
    <section className="value-section">
      <div className="value-section-inner">
        <div>
          <h2 className="value-heading">Architectural<br />Intelligence</h2>
          <p className="value-desc">
            Our framework deciphers the visual language of the built environment through
            deep learning and historical taxonomy.
          </p>
        </div>
        <div className="value-cards">
          {VALUE_PROPS.map((f) => (
            <div key={f.title} className="value-card">
              <span className="value-card-icon">{f.icon}</span>
              <h3 className="value-card-title">{f.title}</h3>
              <p className="value-card-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Section ────────────────────────────────────────
function CtaSection({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="cta-section grid-background">
      <div className="cta-box">
        <span className="cta-corner cta-corner-tl" />
        <span className="cta-corner cta-corner-tr" />
        <span className="cta-corner cta-corner-bl" />
        <span className="cta-corner cta-corner-br" />
        <h2 className="cta-title">Access the Full Library</h2>
        <p className="cta-desc">
          Explore all architectural styles, exemplars, regions, and epochs
          in our complete visual index.
        </p>
        <div className="cta-actions">
          <button className="btn-primary" onClick={() => onSearch('architecture')}>
            Browse All Styles
          </button>
          <button className="btn-ghost" onClick={() => onSearch('historical architecture')}>
            View Catalogue
          </button>
        </div>
        <p className="cta-note">
          {architectureStyles.length} styles · 46 exemplars · 16 regions · 4 epochs
        </p>
      </div>
    </section>
  );
}

// ── Epoch Strip ────────────────────────────────────────
function EpochStrip({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="epoch-section">
      <p className="epoch-eyebrow">Ledger · by epoch</p>
      <div className="epoch-rows">
        {EPOCH_GROUPS.map((g, gi) => (
          <motion.div
            key={g.id}
            className="epoch-row"
            onClick={() => onSearch(g.styles[0])}
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: gi * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="epoch-row-label">
              <span className="epoch-count">{String(g.styles.length).padStart(2, '0')} styles</span>
              <h4>{g.label}</h4>
            </div>
            <div className="epoch-names">
              {g.styles.map((s, i) => (
                <span key={s}>
                  {s}
                  {i < g.styles.length - 1 && <span className="epoch-sep">·</span>}
                </span>
              ))}
            </div>
            <button
              className="epoch-jump"
              onClick={(e) => { e.stopPropagation(); onSearch(g.label); }}
            >
              See all →
            </button>
          </motion.div>
        ))}
      </div>
    </section>
  );
}


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
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<'monograph' | 'dark'>('monograph');

  const [exampleQueries, setExampleQueries] = useState<{ text: string; style: string }[]>([]);
  const [ticker2Styles, setTicker2Styles] = useState<string[]>([]);

  useEffect(() => {
    const shuffled = [...architectureStyles].sort(() => Math.random() - 0.5);
    setExampleQueries(shuffled.slice(0, 10).map((s) => ({ text: s, style: shortStyleTag(s) })));
    setTicker2Styles([...architectureStyles].sort(() => Math.random() - 0.5));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('vq_theme');
      if (saved === 'dark') setTheme('dark');
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'monograph' : 'dark';
      try { localStorage.setItem('vq_theme', next); } catch {}
      return next;
    });
  }, []);


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

  const blobUrlRef = useRef<string | null>(null);

  const handleSearch = useCallback((q: string) => {
    submit(q);
    setView({ name: 'results' });
  }, [submit]);

  const handleImageSearch = useCallback(async (file: File) => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    // Show full-screen scanner immediately with the uploaded image
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setUploadPreviewUrl(blobUrl);
    setUploadAnalyzing(true);

    // CLIP search (fast) + ephemeral VLM analysis (slow) — nothing stored on server
    const analysisPromise = analyzeEphemeral(file).catch((err) => {
      console.error('[Ephemeral analysis failed]', err);
      return null;
    });

    await submitByImage(file);
    setView({ name: 'results' });

    try {
      const analysis = await analysisPromise;

      const uploadedItem: SearchResultItem = {
        building_id: null,
        image_id: `ephemeral-${Date.now()}`,
        score: 1.0,
        metadata: {
          description: analysis?.description,
          typology: analysis?.building_type ? [analysis.building_type] : undefined,
          materials: analysis?.materials ?? undefined,
          structural_system: analysis?.architectural_elements?.structural?.[0] ?? undefined,
          climate_zone: analysis?.environment?.climate_indicators?.[0] ?? undefined,
        },
        source: { url: '', license: 'unknown' },
        image_url: blobUrl,
        image_metadata: analysis ? {
          title: analysis.title ?? '',
          description: analysis.description ?? '',
          architecture_style_classified: analysis.architecture_style_classified ?? '',
          architecture_style_top: analysis.architecture_style_top ?? [],
        } : {},
        tags: analysis?.architecture_style_classified ? [analysis.architecture_style_classified] : [],
        ephemeral_artifacts: analysis ?? undefined,
      };

      setView({ name: 'detail', item: uploadedItem, from: 'results' });
    } finally {
      setUploadAnalyzing(false);
      setUploadPreviewUrl(null);
    }
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

  const relatedItems = useMemo(() => {
    if (view.name !== 'detail') return [];
    const { item } = view;
    if (item.ephemeral_artifacts !== undefined || item.image_id.startsWith('ephemeral-')) {
      return allResults.filter((r) => r.image_id !== item.image_id).slice(0, 6);
    }
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
    <div className="app" data-theme={theme}>
      <Header
        view={viewName}
        onNav={handleNav}
        resultCount={view.name === 'results' ? allResults.length : undefined}
        theme={theme}
        onToggleTheme={toggleTheme}
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
            {/* Full-viewport first fold */}
            <div className="hero-above-fold" style={{ position: 'relative' }}>
              <div className="arch-overlay" />
              <div className="hero-content">
                <motion.div variants={heroItem} style={{ display: 'flex', justifyContent: 'center' }}>
                  <VQLogo variant="hero" />
                </motion.div>

                <motion.h1 variants={heroItem}>
                  Search styles, components,
                  <br />
                  <em>and built precedents</em>
                </motion.h1>
                <motion.p className="lede" variants={heroItem}>
                  Describe a spatial quality or upload an image. Visquery classifies
                  architectural styles and explains what it finds.
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
                    {exampleQueries.map((q) => (
                      <motion.button
                        key={q.text}
                        className="suggest-chip"
                        variants={heroItem}
                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleSearch(q.text)}
                      >
                        {q.text}
                      </motion.button>
                    ))}
                  </motion.div>

                </motion.div>
              </div>
            </div>

            {/* Ticker — shuffled styles, client-only to avoid hydration mismatch */}
            {ticker2Styles.length > 0 && (
              <motion.div
                className="ticker-strip"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0, duration: 0.7 }}
                aria-hidden="true"
              >
                <div className="ticker-track">
                  {[...ticker2Styles, ...ticker2Styles].map((s, i) => (
                    <span key={i} className="ticker-item">{s}</span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Value proposition */}
            <ValuePropsSection />

            {/* Atlas masonry showcase */}
            <AtlasSection onSearch={handleSearch} />

            {/* Ask the Image interactive feature */}
            <AskTheImageSection onSearch={handleSearch} />

            {/* Epoch ledger */}
            <EpochStrip onSearch={handleSearch} />

            {/* CTA */}
            <CtaSection onSearch={handleSearch} />

            <SiteFooter />
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
              <div className="error-banner">{error}</div>
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

      {/* ── Analyzing overlay ── */}
      <AnimatePresence>
        {uploadAnalyzing && (
          <motion.div
            className="analyzing-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="analyzing-card"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {/* Scanner frame with uploaded image */}
              {uploadPreviewUrl && (
                <div className="scan-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadPreviewUrl} alt="" className="scan-img" />
                  <div className="scan-grid-overlay" />
                  <div className="scan-line" />
                  <div className="scan-corner scan-corner-tl" />
                  <div className="scan-corner scan-corner-tr" />
                  <div className="scan-corner scan-corner-bl" />
                  <div className="scan-corner scan-corner-br" />
                  <div className="scan-status-bar">
                    <div className="scan-status-dot" />
                    <span className="scan-status-text">Extracting architectural artifacts</span>
                  </div>
                </div>
              )}
              <p className="analyzing-title">Classifying architecture</p>
              <p className="analyzing-sub">
                Vision model extracting style, materials &amp; structural elements
              </p>
              <p className="analyzing-eta">Estimated · 20 – 60 seconds</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
