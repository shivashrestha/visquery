'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/types';
import BuildingCard from './BuildingCard';
import { search } from '@/lib/api';
import { getPersonalImages, personalImageToResultItem } from '@/lib/personalImages';

interface CollectionsViewProps {
  favItems: SearchResultItem[];
  onOpen: (item: SearchResultItem) => void;
  favs: Record<string, boolean>;
  onFav: (item: SearchResultItem) => void;
}

type Collection = { name: string; items: SearchResultItem[] };

const ARCHITECTURE_STYLES = [
  'Achaemenid architecture',
  'American Foursquare architecture',
  'American craftsman style',
  'Ancient Egyptian architecture',
  'Art Deco architecture',
  'Art Nouveau architecture',
  'Baroque architecture',
  'Bauhaus architecture',
  'Beaux-Arts architecture',
  'Byzantine architecture',
  'Chicago school architecture',
  'Colonial architecture',
  'Deconstructivism',
  'Edwardian architecture',
  'Georgian architecture',
  'Gothic architecture',
  'Greek Revival architecture',
  'International style',
  'Novelty architecture',
  'Palladian architecture',
  'Postmodern architecture',
  'Queen Anne architecture',
  'Romanesque architecture',
];

export default function CollectionsView({ favItems, onOpen, favs, onFav }: CollectionsViewProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalItems, setPersonalItems] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    const imgs = getPersonalImages();
    setPersonalItems(imgs.map(personalImageToResultItem));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const results = await Promise.allSettled(
        ARCHITECTURE_STYLES.map(async (style) => {
          try {
            const r = await search({ query: style });
            return { name: style, items: r.results.slice(0, 4) };
          } catch {
            return { name: style, items: [] as SearchResultItem[] };
          }
        }),
      );
      if (cancelled) return;
      const cols: Collection[] = results
        .filter((r): r is PromiseFulfilledResult<Collection> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((c) => c.items.length > 0);
      setCollections([
        ...cols,
        { name: 'Saved by you', items: favItems },
      ]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [favItems]);

  const allCollections: Collection[] = [
    ...(personalItems.length > 0 ? [{ name: 'Personal', items: personalItems }] : []),
    ...collections,
  ];

  return (
    <main className="collections-main fade-in">
      <div className="results-bar">
        <div className="query-echo">
          <div className="lbl">Collections</div>
          <p className="q">Browse by architectural style</p>
        </div>
        <span className="results-meta">
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
                />
              ))}
            </div>
          )}
        </motion.section>
      ))}

    </main>
  );
}
