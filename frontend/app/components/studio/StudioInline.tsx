'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Database, FileText, FolderOpen, LayoutDashboard, Search as SearchIcon, User as UserIcon,
} from 'lucide-react';

import ResultsView from '../ResultsView';
import LibraryView from '../LibraryView';
import DetailView from '../DetailView';
import Header, { type ViewName } from '../Header';

import { type StudioNavItem, type StudioSection } from './StudioSidebar';
import StudioTopbar from './StudioTopbar';
import StudioOverview from './StudioOverview';
import StudioAccount from './StudioAccount';
import StudioLanding, { type StudioUser } from './StudioLanding';
import SourcesSection from './SourcesSection';
import StudioDocuments from './StudioDocuments';

import { useSearch } from '@/lib/hooks';
import type { SearchResultItem } from '@/lib/types';
import { analyzeEphemeral } from '@/lib/api';

import './studio.css';

const NAV: StudioNavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'search',   label: 'Search',   icon: SearchIcon },
  { id: 'library',  label: 'Library',  icon: FolderOpen },
  { id: 'sources',  label: 'Sources',  icon: Database },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'account',  label: 'Account',  icon: UserIcon },
];

const QUICK_STYLES = ['Brutalism', 'Beaux-Arts', 'Bauhaus', 'Achaemenid', 'Postmodern'];

type ShellView =
  | { name: 'section'; section: StudioSection }
  | { name: 'detail';  item: SearchResultItem; from: StudioSection };

// ════════════════════════════════════════════════════════════
// Authenticated workspace shell (no outer topbar — main Header above)
// ════════════════════════════════════════════════════════════
function Shell({ user, onLogout }: { user: StudioUser; onLogout: () => void }) {
  const [view, setView] = useState<ShellView>({ name: 'section', section: 'overview' });
  const search = useSearch();
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const [favItems, setFavItems] = useState<Record<string, SearchResultItem>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('vq_studio_favs') || '{}'); } catch { return {}; }
  });
  const favs = useMemo(() => {
    const out: Record<string, boolean> = {};
    Object.keys(favItems).forEach((k) => { out[k] = true; });
    return out;
  }, [favItems]);
  const toggleFav = useCallback((item: SearchResultItem) => {
    setFavItems((prev) => {
      const next = { ...prev };
      if (next[item.image_id]) delete next[item.image_id];
      else next[item.image_id] = item;
      try { localStorage.setItem('vq_studio_favs', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const goSection = useCallback((s: StudioSection) => {
    setView({ name: 'section', section: s });
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, []);

  const handleSearchSubmit = useCallback((q: string) => {
    search.submit(q);
    setView({ name: 'section', section: 'search' });
  }, [search]);

  const handleImageSearch = useCallback(async (file: File) => {
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    setUploadAnalyzing(true);
    const analysisPromise = analyzeEphemeral(file).catch(() => null);
    await search.submitByImage(file);
    setView({ name: 'section', section: 'search' });
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
      setView({ name: 'detail', item: uploadedItem, from: 'search' });
    } finally {
      setUploadAnalyzing(false);
    }
  }, [search]);

  const handleOpen = useCallback((item: SearchResultItem) => {
    const from: StudioSection = view.name === 'section' ? view.section : view.from;
    setView({ name: 'detail', item, from });
  }, [view]);

  const handleBack = useCallback(() => {
    if (view.name === 'detail') setView({ name: 'section', section: view.from });
  }, [view]);

  const currentSection: StudioSection | null = view.name === 'section' ? view.section : null;

  const allResults = search.results?.results ?? [];
  const relatedItems = useMemo(() => {
    if (view.name !== 'detail') return [];
    const { item } = view;
    return allResults
      .filter((r) =>
        r.image_id !== item.image_id &&
        (r.metadata.typology?.some((t) => item.metadata.typology?.includes(t)) ||
          r.metadata.materials?.some((m) => item.metadata.materials?.includes(m))))
      .slice(0, 6);
  }, [view, allResults]);

  const fullbleed =
    view.name === 'detail' ||
    currentSection === 'library' ||
    currentSection === 'search' ||
    currentSection === 'documents';

  return (
    <div className="vqs-shell-root">
      <StudioTopbar
        nav={NAV}
        activeSection={currentSection}
        onNavigate={goSection}
        onSearch={handleSearchSubmit}
        onImageSearch={handleImageSearch}
        user={user}
        onLogout={onLogout}
      />

      <div ref={mainRef} className={`vqs-main${fullbleed ? ' is-fullbleed' : ''}`}>
        {view.name === 'detail' && (
          <div className="vqs-host">
            <DetailView
              item={view.item}
              related={relatedItems}
              onBack={handleBack}
              favs={favs}
              onFav={toggleFav}
              onOpen={handleOpen}
              archiveEnabled
            />
          </div>
        )}

        {currentSection === 'overview' && (
          <StudioOverview
            user={user}
            onNavigate={goSection}
            onSearchChip={handleSearchSubmit}
            onOpenItem={handleOpen}
          />
        )}

        {currentSection === 'search' && (
          <div className="vqs-search-page">
            {(search.results || search.loading) ? (
              <div className="vqs-host">
                <ResultsView
                  items={allResults}
                  allItems={allResults}
                  loading={search.loading}
                  filters={search.filters}
                  onFilterChange={search.updateFilters}
                  activeFilterCount={search.activeFilterCount}
                  onOpen={handleOpen}
                  favs={favs}
                  onFav={toggleFav}
                  showAISummary
                  query={search.query}
                  committed={search.query}
                  queryTerms={search.query.toLowerCase().split(/[\s,]+/).filter(Boolean)}
                  hasMore={!!search.results && allResults.length > 0 && allResults.length % 30 === 0}
                  onLoadMore={search.loadMore}
                />
              </div>
            ) : (
              <div className="vqs-search-empty">
                <p>Search from the bar above — type a style, or use the image button to search by picture.</p>
                <div className="vqs-quick-chips" style={{ justifyContent: 'center' }}>
                  {QUICK_STYLES.map((s) => (
                    <button key={s} type="button" className="vqs-chip" onClick={() => handleSearchSubmit(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentSection === 'library' && (
          <div className="vqs-host">
            <LibraryView
              onOpen={handleOpen}
              favs={favs}
              onFav={toggleFav}
              apiEndpoint="/api/studio/images"
            />
          </div>
        )}

        {currentSection === 'sources' && <SourcesSection />}

        {currentSection === 'documents' && <StudioDocuments />}

        {currentSection === 'account' && (
          <StudioAccount user={user} onLogout={onLogout} />
        )}
      </div>

      <AnimatePresence>
        {uploadAnalyzing && (
          <motion.div
            className="vqs-analyzing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="vqs-analyzing-card">
              <span className="vqs-spinner vqs-spinner-lg" />
              <p>Classifying architecture…</p>
              <p className="vqs-analyzing-sub">
                Vision model extracting style, materials &amp; structural elements
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// StudioInline — entry: bootstrap session, render landing or shell
// Lives inside HomePage; no outer header of its own.
// ════════════════════════════════════════════════════════════
export default function StudioInline() {
  const [user, setUser] = useState<StudioUser | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/studio/auth/me');
        const data = await res.json();
        if (data.user) setUser(data.user);
      } catch { /* ignore */ }
      setBootstrapped(true);
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    try { await fetch('/api/studio/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setUser(null);
  }, []);

  if (!bootstrapped) {
    return (
      <div className="vqs-boot">
        <span className="vqs-spinner vqs-spinner-lg" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }
  if (!user) {
    const handleNav = (v: ViewName) => {
      if (v === 'home') window.location.href = '/';
      else if (v === 'library') window.location.href = '/?view=library';
      else if (v === 'collections') window.location.href = '/?view=collections';
      else if (v === 'results') window.location.href = '/';
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Header view="studio" onNav={handleNav} />
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <StudioLanding onLogin={setUser} />
        </div>
      </div>
    );
  }
  return <Shell user={user} onLogout={handleLogout} />;
}
