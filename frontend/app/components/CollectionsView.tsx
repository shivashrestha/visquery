'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import BuildingCard from './BuildingCard';
import ReportSelectBar from './ReportSelectBar';
import ReportView from './ReportView';
import { search, type ReportFocus } from '@/lib/api';
import { getPersonalImages, personalImageToResultItem } from '@/lib/personalImages';

interface CollectionsViewProps {
  favItems: SearchResultItem[];
  onOpen: (item: SearchResultItem) => void;
  favs: Record<string, boolean>;
  onFav: (item: SearchResultItem) => void;
}

type Collection = { name: string; items: SearchResultItem[] };

// Ordered by frequency in dataset. key = lowercase term sent to style filter.
const ARCHITECTURE_STYLES: { name: string; key: string }[] = [
  { name: 'Modernism', key: 'modernism' },
  { name: 'Neoclassical', key: 'neoclassical' },
  { name: 'Baroque', key: 'baroque' },
  { name: 'Islamic Architecture', key: 'islamic' },
  { name: 'Neo-Gothic', key: 'neo gothic' },
  { name: 'Beaux-Arts', key: 'beaux arts' },
  { name: 'Contemporary', key: 'contemporary' },
  { name: 'Historicism', key: 'historicism' },
  { name: 'Art Deco', key: 'art deco' },
  { name: 'Brutalism', key: 'brutalism' },
  { name: 'Neo-Renaissance', key: 'neo renaissance' },
  { name: 'Gothic Revival', key: 'gothic revival' },
  { name: 'Art Nouveau', key: 'art nouveau' },
  { name: 'Deconstructivism', key: 'deconstructivism' },
  { name: 'Byzantine', key: 'byzantine' },
  { name: 'Chicago School', key: 'chicago school' },
  { name: 'Greek Revival', key: 'greek revival' },
  { name: 'International Style', key: 'international style' },
  { name: 'Palladian', key: 'palladian' },
  { name: 'Postmodern', key: 'postmodern' },
  { name: 'Romanesque', key: 'romanesque' },
  { name: 'Queen Anne', key: 'queen anne' },
  { name: 'Achaemenid', key: 'achaemenid' },
];

const CACHE_KEY = 'collections_cache_v1';

export default function CollectionsView({ favItems, onOpen, favs, onFav }: CollectionsViewProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalItems, setPersonalItems] = useState<SearchResultItem[]>([]);
  const loadedRef = useRef(false);

  // Precedent report selection
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, SearchResultItem>>({});
  const [reportFocus, setReportFocus] = useState<ReportFocus | ''>('');
  const [reportItems, setReportItems] = useState<SearchResultItem[] | null>(null);

  const toggleSelect = (item: SearchResultItem) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.image_id]) delete next[item.image_id];
      else next[item.image_id] = item;
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelected({}); };
  const selectedItems = Object.values(selected);

  useEffect(() => {
    const imgs = getPersonalImages();
    setPersonalItems(imgs.map(personalImageToResultItem));
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Serve from cache if available
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        setCollections(JSON.parse(cached) as Collection[]);
        setLoading(false);
        return;
      }
    } catch {}

    let cancelled = false;
    async function load() {
      setLoading(true);
      const results = await Promise.allSettled(
        ARCHITECTURE_STYLES.map(async (style) => {
          try {
            const r = await search({ query: style.name, filters: { style: [style.key] } });
            return { name: style.name, items: r.results.slice(0, 4) };
          } catch {
            return { name: style.name, items: [] as SearchResultItem[] };
          }
        }),
      );
      if (cancelled) return;
      const cols: Collection[] = results
        .filter((r): r is PromiseFulfilledResult<Collection> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((c) => c.items.length > 0);
      setCollections(cols);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cols)); } catch {}
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []); // favItems intentionally excluded — fav changes must not re-fetch all styles

  const allCollections: Collection[] = [
    ...(personalItems.length > 0 ? [{ name: 'Personal', items: personalItems }] : []),
    ...collections,
    { name: 'Saved by you', items: favItems },
  ];

  return (
    <main className="collections-main fade-in">
      <div className="results-bar">
        <div className="query-echo">
          <div className="lbl">Collections</div>
          <p className="q">Browse by architectural style</p>
        </div>
        <span className="results-meta">
          <button
            className={`btn-ghost report-mode-toggle${selectMode ? ' on' : ''}`}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            <FileText size={11} />
            {selectMode ? 'Cancel selection' : 'Precedent Report'}
          </button>
          {allCollections.length} collections
        </span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Loading collections…
        </div>
      )}

      {allCollections.map((col, ci) => (
        <motion.section
          key={col.name}
          className="collection-section"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ci * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="collection-head">
            <h3>
              {col.name === 'Personal' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {col.name}
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-muted)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    padding: '2px 5px',
                  }}>
                    Browser only
                  </span>
                </span>
              ) : col.name}
            </h3>
            <span className="collection-count">{col.items.length} items</span>
          </div>

          {col.items.length === 0 ? (
            <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
              {col.name === 'Saved by you'
                ? 'Click the heart on any card to save it here.'
                : 'No items found for this style.'}
            </p>
          ) : (
            <div className="grid">
              {col.items.slice(0, 4).map((item, i) => (
                <BuildingCard
                  key={item.image_id}
                  result={item}
                  onClick={onOpen}
                  onFav={onFav}
                  fav={!!favs[item.image_id]}
                  index={i}
                  selectable={selectMode}
                  selected={!!selected[item.image_id]}
                  onSelectToggle={toggleSelect}
                />
              ))}
            </div>
          )}
        </motion.section>
      ))}

      <AnimatePresence>
        {selectMode && (
          <ReportSelectBar
            count={selectedItems.length}
            focus={reportFocus}
            onFocusChange={setReportFocus}
            onGenerate={() => setReportItems(selectedItems)}
            onCancel={exitSelectMode}
          />
        )}
      </AnimatePresence>

      {reportItems && (
        <ReportView
          items={reportItems}
          focus={reportFocus || undefined}
          onClose={() => setReportItems(null)}
        />
      )}
    </main>
  );
}
