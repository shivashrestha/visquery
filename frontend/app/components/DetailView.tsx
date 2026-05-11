'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Copy, ExternalLink } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import BuildingCard from './BuildingCard';
import { chatImage } from '@/lib/api';

interface DetailViewProps {
  item: SearchResultItem;
  related: SearchResultItem[];
  onBack: () => void;
  favs: Record<string, boolean>;
  onFav: (item: SearchResultItem) => void;
  onOpen: (item: SearchResultItem) => void;
}

const STARTER_QS = [
  "What's the structural strategy?",
  "Compare to similar precedents",
  "Suitable for a hot climate?",
  "What materials and finishes?",
];

type ChatMsg = { who: 'user' | 'ai'; text: string };

function getMotifLabel(item: SearchResultItem): string {
  const mat = item.metadata.materials?.[0] ?? '';
  const typ = item.metadata.typology?.[0] ?? '';
  return [mat, typ.replace(/_/g, ' ')].filter(Boolean).join(' · ');
}

function PseudoThumb({ item }: { item: SearchResultItem }) {
  const mat = item.metadata.materials?.[0]?.toLowerCase() ?? '';
  const motifMap: Record<string, string> = {
    timber: 'timber-vault', glass: 'glass-box', brick: 'brick-grid',
    steel: 'industrial', earth: 'thick-wall', concrete: 'cantilever', stone: 'thick-wall',
  };
  const motif = motifMap[mat] ?? 'thick-wall';
  const colorsMap: Record<string, [string, string, string]> = {
    concrete: ['#c4c1b8', '#6f6a60', '#1f1d18'],
    brick: ['#c79775', '#7d4a2f', '#2a1812'],
    timber: ['#e6dcc6', '#b08a52', '#3a2d1c'],
    stone: ['#d8cdb8', '#8a7458', '#403426'],
    glass: ['#cbd0c9', '#5d6862', '#1a1f1c'],
    steel: ['#bcbab2', '#4d4a44', '#15140f'],
    earth: ['#e3c79c', '#a06d3c', '#3a2110'],
  };
  const [c1, c2, c3] = colorsMap[mat] ?? ['#d4d0c8', '#7a7268', '#252218'];
  return (
    <div
      className={`pp ${motif}`}
      style={{ width: '100%', height: '100%', '--c1': c1, '--c2': c2, '--c3': c3 } as React.CSSProperties}
    />
  );
}

function ImageOrPlaceholder({ item, fill = false }: { item: SearchResultItem; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (item.image_url && !failed) {
    return (
      <Image
        src={item.image_url}
        alt={item.metadata.architect ?? 'Building'}
        fill={fill}
        width={fill ? undefined : 600}
        height={fill ? undefined : 400}
        className="object-cover w-full h-full"
        onError={() => setFailed(true)}
        priority
      />
    );
  }
  return <PseudoThumb item={item} />;
}

export default function DetailView({
  item,
  related,
  onBack,
  favs,
  onFav,
  onOpen,
}: DetailViewProps) {
  const [activeImg, setActiveImg] = useState(0);
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      who: 'ai',
      text: `This is a ${(item.metadata.typology?.[0] ?? 'building').replace(/_/g, ' ')} in ${(item.metadata.materials ?? []).join(' + ').toLowerCase() || 'unknown materials'}, dated ${item.metadata.year_built ?? 'unknown'}. ${item.metadata.description ?? item.explanation ?? ''}`,
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);
  const fav = !!favs[item.image_id];

  const thumbs = [item, ...related.slice(0, 4)];

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [msgs, thinking]);

  const ask = useCallback(async (q: string) => {
    setMsgs((m) => [...m, { who: 'user', text: q }]);
    setDraft('');
    setThinking(true);
    try {
      const answer = await chatImage(item.image_id, q);
      setMsgs((m) => [...m, { who: 'ai', text: answer }]);
    } catch {
      setMsgs((m) => [...m, { who: 'ai', text: 'Unable to answer right now.' }]);
    } finally {
      setThinking(false);
    }
  }, [item.image_id]);

  const locationStr = [item.metadata.location_city, item.metadata.location_country]
    .filter(Boolean).join(', ');

  const materials = item.metadata.materials ?? [];

  return (
    <div className="detail-shell">
      {/* Main content */}
      <div className="detail-main fade-in" key={item.image_id}>
        <button className="detail-back" onClick={onBack}>
          <ArrowLeft size={11} /> Back to results
        </button>

        {/* Hero image */}
        <motion.div className="detail-hero" layoutId={`hero-${item.image_id}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={thumbs[activeImg].image_id + activeImg}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <ImageOrPlaceholder item={thumbs[activeImg]} fill />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Thumbnail strip */}
        <div className="detail-thumbs">
          {thumbs.map((t, i) => (
            <div
              key={t.image_id + i}
              className={`detail-thumb${i === activeImg ? ' on' : ''}`}
              onClick={() => setActiveImg(i)}
            >
              <ImageOrPlaceholder item={t} fill />
            </div>
          ))}
        </div>

        {/* Title + actions */}
        <div className="detail-head">
          <div>
            <h1>{item.source.title || item.metadata.architect || 'Untitled'}</h1>
            <p className="sub">
              {[item.metadata.architect, locationStr, item.metadata.year_built]
                .filter(Boolean).join(', ')}
            </p>
          </div>
          <div className="actions">
            <motion.button
              className="btn-ghost"
              onClick={() => onFav(item)}
              whileTap={{ scale: 0.92 }}
            >
              <Heart size={12} fill={fav ? 'currentColor' : 'none'} />
              {fav ? 'Saved' : 'Save'}
            </motion.button>
            {item.source.url && (
              <a
                href={item.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                <ExternalLink size={12} /> Source
              </a>
            )}
          </div>
        </div>

        {/* Detail grid */}
        <div className="detail-grid">
          <div className="detail-section">
            <h4>Description</h4>
            {item.explanation && (
              <p style={{ fontStyle: 'italic' }}>{item.explanation}</p>
            )}
            {item.metadata.description && (
              <p>{item.metadata.description}</p>
            )}
            {!item.explanation && !item.metadata.description && (
              <p style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                No description available.
              </p>
            )}
          </div>

          <div className="detail-section">
            <h4>Metadata</h4>
            <dl className="detail-meta-list">
              {item.metadata.typology && item.metadata.typology.length > 0 && (
                <>
                  <dt>Typology</dt>
                  <dd>{item.metadata.typology.map((t) => t.replace(/_/g, ' ')).join(', ')}</dd>
                </>
              )}
              {materials.length > 0 && (
                <>
                  <dt>Material</dt>
                  <dd>{materials.join(', ')}</dd>
                </>
              )}
              {item.metadata.structural_system && (
                <>
                  <dt>Structure</dt>
                  <dd>{item.metadata.structural_system.replace(/_/g, ' ')}</dd>
                </>
              )}
              {item.metadata.climate_zone && (
                <>
                  <dt>Climate</dt>
                  <dd>{item.metadata.climate_zone.replace(/_/g, ' ')}</dd>
                </>
              )}
              {locationStr && (
                <>
                  <dt>Location</dt>
                  <dd>{locationStr}</dd>
                </>
              )}
              {item.metadata.year_built && (
                <>
                  <dt>Year</dt>
                  <dd>{item.metadata.year_built}</dd>
                </>
              )}
            </dl>
          </div>

          {item.source.license && (
            <div className="detail-section">
              <h4>Source</h4>
              <dl className="detail-meta-list">
                {item.source.title && (
                  <>
                    <dt>Title</dt>
                    <dd style={{ fontSize: '0.85rem' }}>{item.source.title}</dd>
                  </>
                )}
                <dt>License</dt>
                <dd style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>
                  {item.source.license.replace(/_/g, ' ')}
                </dd>
                {item.source.photographer && (
                  <>
                    <dt>Photo</dt>
                    <dd>{item.source.photographer}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {(item.tags ?? []).length > 0 && (
            <div className="detail-section">
              <h4>Tags</h4>
              <div className="card-tags">
                {(item.tags ?? []).map((t) => (
                  <span key={t} className="card-tag">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Related strip */}
        {related.length > 0 && (
          <div className="related-strip">
            <h4>Visually related — by embedding distance</h4>
            <div className="related-grid">
              {related.slice(0, 4).map((r) => (
                <BuildingCard
                  key={r.image_id}
                  result={r}
                  onClick={onOpen}
                  onFav={onFav}
                  fav={!!favs[r.image_id]}
                  compact
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RAG sidebar */}
      <aside className="rag">
        <div className="rag-head">
          <div className="lbl">Ask about this image</div>
          <h3>What would you like to know about{' '}
            <em>{item.source.title || item.metadata.architect || 'this building'}</em>?
          </h3>
        </div>

        <div className="rag-stream" ref={streamRef}>
          <AnimatePresence initial={false}>
            {msgs.map((m, i) => (
              <motion.div
                key={i}
                className={`msg ${m.who}`}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              >
                <span className="who">{m.who === 'user' ? 'You' : 'Visquery'}</span>
                <div className="bubble">{m.text}</div>
              </motion.div>
            ))}
            {thinking && (
              <motion.div
                key="thinking"
                className="msg ai"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <span className="who">Visquery</span>
                <div className="bubble">
                  <span className="thinking">
                    reading sources{' '}
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="rag-input">
          <div className="rag-suggest">
            {STARTER_QS.map((q) => (
              <button key={q} onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="rag-input-row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything about this precedent…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) ask(draft.trim());
              }}
            />
            <button
              className="rag-send"
              disabled={!draft.trim() || thinking}
              onClick={() => draft.trim() && ask(draft.trim())}
            >
              Ask
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
