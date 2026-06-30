'use client';

import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Header, { type ViewName } from './components/Header';
import VQLogo from './components/VQLogo';

import SiteFooter from './components/SiteFooter';
import SearchBar from './components/SearchBar';
import ResultsView from './components/ResultsView';
import DetailView from './components/DetailView';
import SegmentSearchModal from './components/SegmentSearchModal';
import CollectionsView from './components/CollectionsView';
import LibraryView from './components/LibraryView';
import { useSearch } from '@/lib/hooks';
import type { SearchResultItem } from '@/lib/types';
import { analyzeEphemeral, getImageById, getSimilarImages, imageUrlToDataUrl, searchBySegmentCrop, searchBySegmentRef, SegmentNotIndexedError, segmentImageFromUrl } from '@/lib/api';
import type { SegmentObject } from '@/lib/api';
import architectureStyles from './architecture_styles.json';
import AssistantChat from './components/AssistantChat';
import {
  shortStyleTag,
  AtlasSection,
  AskTheImageSection,
  SegmentationSection,
  ValuePropsSection,
  CtaSection,
  EpochStrip,
  TryItOutSection,
} from './components/home/MarketingSections';

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

function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Tracks the query string we last pushed ourselves, so the URL→state
  // reconstruction effect below only fires on *external* URL changes
  // (deep link, refresh, browser back/forward) — not on our own pushes.
  const lastPushedQsRef = useRef<string | null>(null);

  const [view, setView] = useState<AppView>({ name: 'home' });
  const [imageSearchUploadUrl, setImageSearchUploadUrl] = useState<string | null>(null);
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [tryoutError, setTryoutError] = useState<string | null>(null);
  // Component-level segment search ("find similar canopies")
  const [segmentSearch, setSegmentSearch] = useState<{
    label: string | null;
    cropUrl: string;
    items: SearchResultItem[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  // Segments detected on the tryout upload, shown as chips in the ephemeral detail view
  const [tryoutSegments, setTryoutSegments] = useState<SegmentObject[] | null>(null);
  // Ephemeral tryout result — pinned in ResultsView so it can join precedent reports
  const [tryoutItem, setTryoutItem] = useState<SearchResultItem | null>(null);
  const [theme, setTheme] = useState<'monograph' | 'dark'>('monograph');

  const [exampleQueries, setExampleQueries] = useState<{ text: string; style: string }[]>([]);
  const [ticker2Styles, setTicker2Styles] = useState<string[]>([]);

  useEffect(() => {
    const fixed = [
      'Modernism',
      'Neoclassical',
      'Baroque',
      'Beaux-Arts',
      'Contemporary',
      'Art Deco',
      'Brutalism',
    ];
    setExampleQueries(fixed.map((s) => ({ text: s, style: shortStyleTag(s) })));
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
      const parsed: Record<string, SearchResultItem> = stored ? JSON.parse(stored) : {};
      // Drop legacy entries saved with a blob: URL — unrecoverable after reload.
      let changed = false;
      for (const [k, v] of Object.entries(parsed)) {
        if (v.image_url?.startsWith('blob:')) { delete parsed[k]; changed = true; }
      }
      if (changed) { try { localStorage.setItem('visquery_favs', JSON.stringify(parsed)); } catch {} }
      return parsed;
    } catch { return {}; }
  });
  const favs = useMemo(() => {
    const out: Record<string, boolean> = {};
    Object.keys(favItems).forEach((k) => { out[k] = true; });
    return out;
  }, [favItems]);

  const toggleFav = useCallback((item: SearchResultItem) => {
    const persist = (next: Record<string, SearchResultItem>) => {
      try { localStorage.setItem('visquery_favs', JSON.stringify(next)); } catch {}
    };
    setFavItems((prev) => {
      if (prev[item.image_id]) {
        const next = { ...prev };
        delete next[item.image_id];
        persist(next);
        return next;
      }
      // blob: URLs (ephemeral/tryout uploads) die on reload → ERR_FILE_NOT_FOUND
      // in the "Saved by you" collection. Bake them into a persistent data: URL.
      if (item.image_url?.startsWith('blob:')) {
        imageUrlToDataUrl(item.image_url).then((dataUrl) => {
          setFavItems((cur) => {
            if (!cur[item.image_id]) return cur; // un-favorited meanwhile
            const next = { ...cur, [item.image_id]: { ...item, image_url: dataUrl ?? item.image_url } };
            persist(next);
            return next;
          });
        });
      }
      const next = { ...prev, [item.image_id]: item };
      persist(next);
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

  // ── URL ⇄ view sync ──────────────────────────────────────
  // Makes results/library/collections/detail deep-linkable and restores
  // state on refresh or browser back/forward. Image-based searches and
  // ephemeral (tryout) detail views can't be encoded in a URL — they fall
  // back to "home" on a cold load, which is the best a stateless link allows.
  const viewToQuery = useCallback((v: AppView, q: string): string => {
    const sp = new URLSearchParams();
    if (v.name === 'results') {
      sp.set('view', 'results');
      if (q) sp.set('q', q);
    } else if (v.name === 'library') {
      sp.set('view', 'library');
    } else if (v.name === 'collections') {
      sp.set('view', 'collections');
    } else if (v.name === 'detail') {
      sp.set('view', 'detail');
      sp.set('id', v.item.image_id);
      sp.set('from', v.from);
      if (q) sp.set('q', q);
    }
    return sp.toString();
  }, []);

  // Blocks the state→URL push while a URL→state reconstruction is in
  // flight (the detail case awaits getImageById) — otherwise the push
  // effect fires on the intermediate "home" render and clobbers the
  // deep link before the async fetch resolves.
  const reconcilingRef = useRef(true);

  // URL → state: reconstruct on deep link, refresh, or back/forward.
  // Declared before the push effect so it settles reconcilingRef first.
  useEffect(() => {
    const qs = searchParams.toString();
    if (qs === lastPushedQsRef.current) return; // change came from our own push
    lastPushedQsRef.current = qs;
    reconcilingRef.current = true;

    const v = searchParams.get('view');
    const q = searchParams.get('q') ?? '';
    const id = searchParams.get('id');
    const from = (searchParams.get('from') as 'results' | 'library' | 'collections') || 'results';

    if (v === 'studio') {
      window.location.replace('/studio');
      return;
    } else if (v === 'results' && q) {
      submit(q);
      setView({ name: 'results' });
    } else if (v === 'library') {
      setView({ name: 'library' });
    } else if (v === 'collections') {
      setView({ name: 'collections' });
    } else if (v === 'detail' && id) {
      if (q) submit(q);
      getImageById(id).then((item) => {
        setView(item ? { name: 'detail', item, from } : { name: 'home' });
        reconcilingRef.current = false;
      });
      return;
    } else {
      setView({ name: 'home' });
    }
    reconcilingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // state → URL: push whenever the view (or its query) changes.
  useEffect(() => {
    if (reconcilingRef.current) return;
    const qs = viewToQuery(view, query);
    if (qs === lastPushedQsRef.current) return;
    lastPushedQsRef.current = qs;
    router.push(qs ? `/?${qs}` : '/', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, query]);

  const handleSearch = useCallback((q: string) => {
    setImageSearchUploadUrl(null);
    setTryoutItem(null);
    submit(q);
    setView({ name: 'results' });
  }, [submit]);

  // SearchBar image upload — CLIP similarity only, shows ResultsView
  const handleImageSearch = useCallback(async (file: File) => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setImageSearchUploadUrl(blobUrl);
    setTryoutItem(null);
    await submitByImage(file);
    setView({ name: 'results' });
  }, [submitByImage]);

  // TryItOut section — full flow: scan animation + VLM artifacts + RAG detail
  const handleImageSearchFull = useCallback(async (file: File) => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setUploadPreviewUrl(blobUrl);
    setUploadAnalyzing(true);
    setTryoutSegments(null);

    const analysisPromise = analyzeEphemeral(file).catch((err) => {
      console.error('[Ephemeral analysis failed]', err);
      return null;
    });

    // Detect components in parallel — surfaced as clickable chips in the detail view
    const segmentsPromise = segmentImageFromUrl(blobUrl, 'fastsam')
      .then((r) => r.segments.filter((s) => s.area_ratio >= 0.02).slice(0, 12))
      .catch((err) => {
        console.error('[Tryout segmentation failed]', err);
        return null;
      });

    await submitByImage(file);
    setView({ name: 'results' });

    try {
      const analysis = await analysisPromise;
      if (!analysis) {
        setTryoutError('No architectural features detected. Please try a clearer photograph of a building or structure.');
        setTimeout(() => setTryoutError(null), 6000);
        return;
      }
      const uploadedItem: SearchResultItem = {
        building_id: null,
        image_id: `ephemeral-${Date.now()}`,
        score: 1.0,
        metadata: {
          description: analysis.description,
          typology: analysis.building_type ? [analysis.building_type] : undefined,
          materials: analysis.materials ?? undefined,
          structural_system: analysis.architectural_elements?.structural?.[0] ?? undefined,
          climate_zone: analysis.environment?.climate_indicators?.[0] ?? undefined,
        },
        source: { url: '', license: 'unknown' },
        image_url: blobUrl,
        image_metadata: {
          title: analysis.title ?? '',
          description: analysis.description ?? '',
          architecture_style_classified: analysis.architecture_style_classified ?? '',
          architecture_style_top: analysis.architecture_style_top ?? [],
        },
        tags: analysis.architecture_style_classified ? [analysis.architecture_style_classified] : [],
        ephemeral_artifacts: analysis,
      };
      setTryoutItem(uploadedItem);
      setView({ name: 'detail', item: uploadedItem, from: 'results' });
      const segs = await segmentsPromise;
      if (segs && segs.length > 0) setTryoutSegments(segs);
    } finally {
      setUploadAnalyzing(false);
      setUploadPreviewUrl(null);
    }
  }, [submitByImage]);

  // Component-level search: segment crop → CLIP → similar components.
  // For corpus images, tries indexed-segment ref (no upload) first to avoid
  // large payload errors; falls back to crop upload for ephemeral/unindexed images.
  const handleSegmentSearch = useCallback(async (
    seg: SegmentObject,
    excludeImageId?: string,
    refImageId?: string,
  ) => {
    setSegmentSearch({
      label: seg.class_name,
      cropUrl: seg.crop_data_url,
      items: [],
      loading: true,
      error: null,
    });
    try {
      let resp;
      if (refImageId) {
        try {
          resp = await searchBySegmentRef(refImageId, seg.id, 12);
        } catch (refErr) {
          if (!(refErr instanceof SegmentNotIndexedError)) throw refErr;
          // Segments not yet indexed — fall back to crop upload
          resp = await searchBySegmentCrop(seg.crop_data_url, 12, excludeImageId);
        }
      } else {
        resp = await searchBySegmentCrop(seg.crop_data_url, 12, excludeImageId);
      }
      setSegmentSearch((prev) => prev ? { ...prev, items: resp.results, loading: false } : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Segment search failed';
      setSegmentSearch((prev) => prev ? { ...prev, loading: false, error: message } : prev);
    }
  }, []);

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
      setImageSearchUploadUrl(null);
      setSegmentSearch(null);
      setTryoutSegments(null);
      setTryoutItem(null);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setView({ name: 'home' });
    } else if (name === 'results') {
      setView({ name: 'results' });
    } else if (name === 'library') {
      setView({ name: 'library' });
    } else if (name === 'collections') {
      setView({ name: 'collections' });
    } else if (name === 'studio') {
      window.location.href = '/studio';
    }
  }, [clearSearch]);

  const allResults = results?.results ?? [];
  const queryTerms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);

  const [relatedItems, setRelatedItems] = useState<SearchResultItem[]>([]);

  const detailItem = view.name === 'detail' ? view.item : null;
  const detailImageId = detailItem?.image_id ?? null;

  useEffect(() => {
    if (!detailItem || !detailImageId) { setRelatedItems([]); return; }

    // Ephemeral images not in CLIP index — fall back to text-search results
    if (detailItem.ephemeral_artifacts !== undefined || detailImageId.startsWith('ephemeral-')) {
      setRelatedItems(
        (results?.results ?? []).filter((r) => r.image_id !== detailImageId).slice(0, 6),
      );
      return;
    }

    let cancelled = false;
    getSimilarImages(detailImageId, 6)
      .then((resp) => { if (!cancelled) setRelatedItems(resp.results); })
      .catch(() => {
        if (!cancelled) setRelatedItems([]);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailImageId]);

  const viewName: ViewName =
    view.name === 'detail' ? view.from : (view.name as ViewName);

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

            {/* Try It Out — full VLM + artifacts flow */}
            <TryItOutSection onImageSearch={handleImageSearchFull} error={tryoutError} />

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

            {/* Component-level segmentation demo */}
            <SegmentationSection onSearch={handleSearch} />

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
              uploadedImageUrl={imageSearchUploadUrl}
              pinnedItem={tryoutItem}
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
              onSegmentSearch={(seg) => {
                const isEphemeral = view.item.image_id.startsWith('ephemeral-');
                handleSegmentSearch(
                  seg,
                  isEphemeral ? undefined : view.item.image_id,
                  isEphemeral ? undefined : view.item.image_id,
                );
              }}
              segmentChips={
                view.item.image_id.startsWith('ephemeral-')
                  ? tryoutSegments ?? undefined
                  : undefined
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Segment similarity search overlay ── */}
      {segmentSearch && (
        <SegmentSearchModal
          label={segmentSearch.label}
          cropUrl={segmentSearch.cropUrl}
          items={segmentSearch.items}
          loading={segmentSearch.loading}
          error={segmentSearch.error}
          onClose={() => setSegmentSearch(null)}
          onOpen={(item) => {
            setSegmentSearch(null);
            handleOpen(item);
          }}
        />
      )}

      {/* ── Assistant Chat — landing page only ── */}
      <AssistantChat visible={view.name === 'home'} />

      {/* ── Analyzing overlay — scanner design ── */}
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

export default function HomePageRoute() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}
