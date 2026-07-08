'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CachedImage from './CachedImage';
import { ArrowLeft, Heart, MessageSquare, Info, Sparkles, Bot, Layers, Search, Archive, ImageIcon, X, ChevronDown, FileText, Maximize2, ScanSearch, Sliders } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import type { SegmentObject, ArchiveStatus, ArchiveCitation } from '@/lib/api';
import BuildingCard from './BuildingCard';
import ArtifactsModal from './ArtifactsModal';
import ToolsMenu, { type RightPanelMode } from './ToolsMenu';
import SegmentPanel from './SegmentPanel';
import ImageEditPanel from './ImageEditPanel';
import ReportView from './ReportView';
import ImageFullscreen from './ImageFullscreen';
import { chatImage, chatEphemeral, chatArchive, getArchiveStatus } from '@/lib/api';

interface DetailViewProps {
  item: SearchResultItem;
  related: SearchResultItem[];
  onBack: () => void;
  favs: Record<string, boolean>;
  onFav: (item: SearchResultItem) => void;
  onOpen: (item: SearchResultItem) => void;
  /** Component-level search: triggered from segment chips / SegmentPanel. */
  onSegmentSearch?: (seg: SegmentObject) => void;
  /** Pre-computed segments (tryout flow) shown as clickable chips under the hero. */
  segmentChips?: SegmentObject[];
  /** Studio only: enables the "Answer from: This image / Archive" chat selector.
   *  Public/tryout flows never set this — zero archive requests, zero UI change. */
  archiveEnabled?: boolean;
}

const STARTER_QS = [
  "What style is this?",
  "Materials and finishes?",
  "How does it respond to climate?",
  "What's the structural approach?",
  "Spatial qualities?",
  "Suitable for a dense urban site?",
];

type ChatSource = 'image' | 'archive';
type ChatMsg = {
  who: 'user' | 'ai';
  text: string;
  source?: ChatSource;
  citations?: ArchiveCitation[];
};

function renderBubble(text: string): React.ReactNode {
  // Strip stray markdown bold markers and render line breaks
  const clean = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
  const lines = clean.split('\n').filter((l) => l.trim() !== '');
  if (lines.length <= 1) return clean;
  return lines.map((line, i) => (
    <span key={i} style={{ display: 'block', marginBottom: i < lines.length - 1 ? '0.5em' : 0 }}>
      {line}
    </span>
  ));
}

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

function ImageOrPlaceholder({ item, fill = false, priority = false }: { item: SearchResultItem; fill?: boolean; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (item.image_url && !failed) {
    return (
      <CachedImage
        src={item.image_url}
        alt={item.metadata.architect ?? 'Building'}
        fill={fill}
        width={fill ? undefined : 600}
        height={fill ? undefined : 400}
        className="object-cover w-full h-full"
        onError={() => setFailed(true)}
        priority={priority}
        sizes="(max-width: 768px) 100vw, 60vw"
      />
    );
  }
  return <PseudoThumb item={item} />;
}

/** Pull a typed value from image_metadata safely. */
function vmeta(item: SearchResultItem, key: string): string {
  const v = item.image_metadata?.[key];
  return typeof v === 'string' ? v : '';
}

export default function DetailView({
  item,
  related,
  onBack,
  favs,
  onFav,
  onOpen,
  onSegmentSearch,
  segmentChips,
  archiveEnabled,
}: DetailViewProps) {
  const [activeImg, setActiveImg] = useState(0);
  const [mobileTab, setMobileTab] = useState<'detail' | 'chat'>('detail');
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [rightMode, setRightMode] = useState<RightPanelMode>('rag');
  const [reportItems, setReportItems] = useState<SearchResultItem[] | null>(null);
  const [fsOpen, setFsOpen] = useState(false);

  // ── Resizable RAG panel ──────────────────────────────────────
  const MIN_RAG = 220;
  const MAX_RAG = 680;
  const DEFAULT_RAG = 360;

  const [ragWidth, setRagWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem('vq_rag_w');
      if (v) return Math.max(MIN_RAG, Math.min(MAX_RAG, parseInt(v, 10)));
    } catch {}
    return DEFAULT_RAG;
  });

  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(DEFAULT_RAG);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = ragWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [ragWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = dragStartX.current - e.clientX;
      setRagWidth(Math.max(MIN_RAG, Math.min(MAX_RAG, dragStartW.current + delta)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setRagWidth((w) => {
        try { localStorage.setItem('vq_rag_w', String(w)); } catch {}
        return w;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Display values — item.metadata > image_metadata fallback
  const displayDescription =
    item.metadata.description ||
    item.explanation ||
    vmeta(item, 'description') ||
    '';
  const displayTitle =
    (item.metadata as Record<string, unknown>).name as string | undefined ||
    item.source.title ||
    item.metadata.architect ||
    vmeta(item, 'title') ||
    '';
  const styleClassified = vmeta(item, 'architecture_style_classified');
  const styleTop = (item.image_metadata?.architecture_style_top ?? []) as [string, number][];
  const rawText = vmeta(item, 'raw_text');

  const initialAiText = (() => {
    const typology = item.metadata.typology?.[0]?.replace(/_/g, ' ');
    const mats = item.metadata.materials?.join(' + ')?.toLowerCase();
    const year = item.metadata.year_built;
    const desc = displayDescription;
    const parts = [typology, mats && `in ${mats}`, year && String(year)].filter(Boolean);
    const intro = parts.length ? parts.join(', ') : null;
    return [intro, desc].filter(Boolean).join('. ') || 'Ask me anything about this image.';
  })();

  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { who: 'ai', text: initialAiText },
  ]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);
  const fav = !!favs[item.image_id];

  // ── Ask the Archive (Studio only) ─────────────────────────────
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatus | null>(null);
  const [askSource, setAskSource] = useState<ChatSource>('image');
  const [scopeIds, setScopeIds] = useState<string[]>([]); // empty = all documents
  const [scopeOpen, setScopeOpen] = useState(false);
  const [drawerCitation, setDrawerCitation] = useState<ArchiveCitation | null>(null);
  const hasArchive = !!archiveEnabled && !!archiveStatus?.has_documents;
  const readyDocs = (archiveStatus?.sources ?? []).filter(
    (s) => s.index_status === 'ready' && s.chunk_count > 0,
  );

  useEffect(() => {
    if (!archiveEnabled) return;
    let cancelled = false;
    getArchiveStatus().then((s) => { if (!cancelled && s) setArchiveStatus(s); });
    return () => { cancelled = true; };
  }, [archiveEnabled]);

  const thumbs = [item, ...related.slice(0, 4)];

  useEffect(() => {
    setMsgs([{ who: 'ai', text: initialAiText }]);
    setAskSource('image');
    setScopeOpen(false);
    setDrawerCitation(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.image_id]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [msgs, thinking]);

  const ask = useCallback(async (q: string) => {
    const source: ChatSource = hasArchive && askSource === 'archive' ? 'archive' : 'image';
    setMsgs((m) => [...m, { who: 'user', text: q, source }]);
    setDraft('');
    setThinking(true);
    try {
      if (source === 'archive') {
        const history = msgs
          .filter((m) => m.source === 'archive' || m.who === 'user')
          .map((m) => ({ who: m.who, text: m.text }));
        const res = await chatArchive(q, history, scopeIds.length ? scopeIds : undefined);
        setMsgs((m) => [...m, { who: 'ai', text: res.answer, source, citations: res.citations }]);
      } else {
        // Existing image chat path — untouched
        const answer = item.ephemeral_artifacts
          ? await chatEphemeral(item.ephemeral_artifacts, q)
          : await chatImage(item.image_id, q);
        setMsgs((m) => [...m, { who: 'ai', text: answer, source }]);
      }
    } catch {
      setMsgs((m) => [...m, { who: 'ai', text: 'Unable to answer right now.', source }]);
    } finally {
      setThinking(false);
    }
  }, [item.image_id, item.ephemeral_artifacts, hasArchive, askSource, scopeIds, msgs]);

  const locationStr = [item.metadata.location_city, item.metadata.location_country]
    .filter(Boolean).join(', ');

  const materials = item.metadata.materials ?? [];

  return (
    <div
      className="detail-shell"
      style={{ gridTemplateColumns: `1fr 5px ${ragWidth}px` }}
    >
      {/* Main content */}
      <div
        className={`detail-main fade-in${mobileTab === 'chat' ? ' mobile-hidden' : ''}`}
        key={item.image_id}
      >
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
              <ImageOrPlaceholder item={thumbs[activeImg]} fill priority={activeImg === 0} />
            </motion.div>
          </AnimatePresence>
          <button
            className="detail-hero-gs-btn"
            onClick={() => {
              const src = thumbs[activeImg].image_url;
              if (!src) return;
              const abs = src.startsWith('http') ? src : window.location.origin + src;
              window.open(
                `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(abs)}`,
                '_blank',
                'noopener,noreferrer'
              );
            }}
            title="Search similar images on Google"
            aria-label="Search similar images on Google"
          >
            <ScanSearch size={14} />
          </button>
          <button
            className="detail-hero-fs-btn"
            onClick={() => setFsOpen(true)}
            title="View fullscreen"
            aria-label="View fullscreen"
          >
            <Maximize2 size={14} />
          </button>
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

        {/* Detected components — tryout flow: photo → segment → similar in 2 clicks */}
        {onSegmentSearch && (segmentChips?.length ?? 0) > 0 && (
          <div className="detail-seg-chips">
            <span className="detail-seg-chips-label">Detected components</span>
            {segmentChips!.map((seg, i) => (
              <button
                key={seg.id}
                className="seg-sim-chip"
                onClick={() => onSegmentSearch(seg)}
                title={`Find similar ${seg.class_name ?? `region ${i + 1}`}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.crop_data_url} alt="" className="seg-sim-chip-thumb" />
                <Search size={10} />
                {seg.class_name ?? `Region ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Title + actions */}
        <div className="detail-head">
          <div>
            {displayTitle && <h1>{displayTitle}</h1>}
            {[item.metadata.architect, locationStr, item.metadata.year_built].filter(Boolean).length > 0 && (
              <p className="sub">
                {[item.metadata.architect, locationStr, item.metadata.year_built]
                  .filter(Boolean).join(', ')}
              </p>
            )}
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
            <motion.button
              className="btn-ghost btn-artifacts"
              onClick={() => setArtifactsOpen(true)}
              whileTap={{ scale: 0.92 }}
              title="View extracted architectural artifacts"
            >
              <Layers size={12} /> Artifacts
            </motion.button>
            <motion.button
              className="btn-ghost"
              onClick={() => setReportItems([item])} //onClick={() => setReportItems(related.length > 0 ? [item, ...related.slice(0, 5)] : [item])}
              whileTap={{ scale: 0.92 }}
              title="Generate a precedent report for this image"
            >
              <FileText size={12} /> Report
            </motion.button>
            <ToolsMenu
              activeMode={rightMode}
              onSelect={(mode) => {
                setRightMode(mode);
                // On mobile the tool renders inside the right panel — reveal it.
                if (mode !== 'rag') setMobileTab('chat');
              }}
            />
          </div>
        </div>

        {/* Detail grid */}
        <div className="detail-grid">

          <div className="detail-section">
            <h4>
              Description
              <span
                className="ai-inline-badge"
                title="AI-generated · descriptions and metadata may not be fully accurate"
              >
                <Bot size={8} />
                AI
              </span>
            </h4>
            {displayDescription ? (
              <p>{displayDescription}</p>
            ) : (
              <p style={{ color: 'var(--ink-faint)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                No description available.
              </p>
            )}
            <button
              className="btn-artifacts-inline"
              onClick={() => setArtifactsOpen(true)}
            >
              <Layers size={11} /> View all artifacts
            </button>
          </div>

          {(
            (item.metadata.typology?.length ?? 0) > 0 ||
            materials.length > 0 ||
            item.metadata.structural_system ||
            item.metadata.climate_zone ||
            locationStr ||
            item.metadata.year_built ||
            styleClassified
          ) && (
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
                {styleClassified && (
                  <>
                    <dt>Style</dt>
                    <dd>{styleClassified}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {styleTop.length > 0 && (
            <div className="detail-section">
              <h4>Style classification</h4>
              <dl className="detail-meta-list">
                {styleTop.map(([style, score]) => (
                  <div key={style} style={{ display: 'contents' }}>
                    <dt style={{ fontWeight: 'normal' }}>{style}</dt>
                    <dd style={{ fontFamily: 'var(--mono)', fontSize: '10px', opacity: 0.7 }}>
                      {(score * 100).toFixed(1)}%
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {rawText && (
            <div className="detail-section">
              <h4>Search index text</h4>
              <p style={{ fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--ink-faint)' }}>
                {rawText}
              </p>
            </div>
          )}

          {item.source.photographer && (
            <div className="detail-section">
              <h4>Photography</h4>
              <dl className="detail-meta-list">
                <dt>Credit</dt>
                <dd>{item.source.photographer}</dd>
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

      {/* Resize handle — hidden on mobile */}
      <div
        className="rag-resize-handle"
        onMouseDown={onHandleMouseDown}
        title="Drag to resize"
      >
        <div className="rag-resize-grip" />
      </div>

      {/* Right panel — switches between RAG chat / Segmentation / Image Edit */}
      <aside className={`rag${mobileTab === 'detail' ? '' : ' mobile-visible'}`}>
        <AnimatePresence mode="wait" initial={false}>

          {/* ── RAG Chat ── */}
          {rightMode === 'rag' && (
            <motion.div
              key="rag"
              className="rag-inner"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
            >
              <div className="rag-head">
                <div className="lbl">Ask about this image</div>
                <h3>What would you like to know about{' '}
                  <em>{displayTitle || 'this building'}</em>?
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
                      <span className={`who${m.who === 'ai' ? ' ai-who' : ''}`}>
                        {m.who === 'ai' && <Sparkles size={9} className="ai-icon" />}
                        {m.who === 'user' ? 'You' : 'Visquery'}
                        {hasArchive && m.source && (
                          <span
                            className={`msg-src-badge${m.source === 'archive' ? ' is-archive' : ''}`}
                            title={m.source === 'archive' ? 'Answered from the archive' : 'Answered from this image'}
                          >
                            {m.source === 'archive' ? <Archive size={8} /> : <ImageIcon size={8} />}
                          </span>
                        )}
                      </span>
                      <div className="bubble">{m.who === 'ai' ? renderBubble(m.text) : m.text}</div>
                      {m.who === 'ai' && (m.citations?.length ?? 0) > 0 && (
                        <div className="cite-chips">
                          {m.citations!.map((c, ci) => (
                            <button
                              key={`${c.source_id}-${c.page}-${ci}`}
                              className="cite-chip"
                              onClick={() => setDrawerCitation(c)}
                              title={`${c.title} — page ${c.page}`}
                            >
                              {c.title.length > 26 ? `${c.title.slice(0, 26)}…` : c.title}, p.{c.page}
                            </button>
                          ))}
                        </div>
                      )}
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
                      <span className="who ai-who">
                        <Sparkles size={9} className="ai-icon" />
                        Visquery
                      </span>
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
                {hasArchive && (
                  <div className="ask-source-row">
                    <span className="ask-source-label">Answer from:</span>
                    <button
                      className={`ask-source-opt${askSource === 'image' ? ' on' : ''}`}
                      onClick={() => setAskSource('image')}
                    >
                      <ImageIcon size={10} /> This image
                    </button>
                    <button
                      className={`ask-source-opt${askSource === 'archive' ? ' on' : ''}`}
                      onClick={() => setAskSource('archive')}
                    >
                      <Archive size={10} /> Archive
                    </button>
                    {askSource === 'archive' && readyDocs.length > 1 && (
                      <span className="ask-scope-wrap">
                        <button className="ask-scope-btn" onClick={() => setScopeOpen((o) => !o)}>
                          {scopeIds.length === 0 ? 'All documents' : `${scopeIds.length} selected`}
                          <ChevronDown size={10} />
                        </button>
                        {scopeOpen && (
                          <span className="ask-scope-pop">
                            <label className="ask-scope-item">
                              <input
                                type="checkbox"
                                checked={scopeIds.length === 0}
                                onChange={() => setScopeIds([])}
                              />
                              All documents
                            </label>
                            {readyDocs.map((d) => (
                              <label key={d.source_id} className="ask-scope-item">
                                <input
                                  type="checkbox"
                                  checked={scopeIds.includes(d.source_id)}
                                  onChange={() =>
                                    setScopeIds((prev) =>
                                      prev.includes(d.source_id)
                                        ? prev.filter((x) => x !== d.source_id)
                                        : [...prev, d.source_id],
                                    )
                                  }
                                />
                                {d.title}
                              </label>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
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
            </motion.div>
          )}

          {/* ── Segmentation ── */}
          {rightMode === 'segment' && (
            <motion.div
              key="segment"
              className="rag-inner"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              <SegmentPanel imageId={item.image_id} imageUrl={item.image_url} onFindSimilar={onSegmentSearch} />
            </motion.div>
          )}

          {/* ── Image Edit ── */}
          {rightMode === 'edit' && (
            <motion.div
              key="edit"
              className="rag-inner"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              style={{ flex: 1, minHeight: 0, overflow: 'hidden auto', display: 'flex', flexDirection: 'column' }}
            >
              <ImageEditPanel
                imageUrl={item.image_url}
                imageTitle={displayTitle || undefined}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </aside>

      {/* Mobile tab bar — only visible on narrow screens via CSS */}
      <div className="mobile-tabs">
        <button
          className={mobileTab === 'detail' ? 'is-active' : ''}
          onClick={() => setMobileTab('detail')}
        >
          <Info size={13} />
          Details
        </button>
        <button
          className={mobileTab === 'chat' ? 'is-active' : ''}
          onClick={() => setMobileTab('chat')}
        >
          {rightMode === 'segment' ? (
            <><ScanSearch size={13} /> Segment</>
          ) : rightMode === 'edit' ? (
            <><Sliders size={13} /> Edit</>
          ) : (
            <><MessageSquare size={13} /> Ask AI</>
          )}
        </button>
      </div>

      {/* Archive citation drawer */}
      <AnimatePresence>
        {drawerCitation && (
          <motion.div
            className="cite-drawer"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.2 }}
          >
            <div className="cite-drawer-head">
              <div>
                <div className="cite-drawer-title">{drawerCitation.title}</div>
                <div className="cite-drawer-page">Page {drawerCitation.page}</div>
              </div>
              <button
                className="cite-drawer-close"
                onClick={() => setDrawerCitation(null)}
                aria-label="Close citation"
              >
                <X size={13} />
              </button>
            </div>
            <p className="cite-drawer-snippet">{drawerCitation.snippet}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <ArtifactsModal
        open={artifactsOpen}
        imageId={item.image_id}
        buildingName={displayTitle || undefined}
        prefetched={(item.ephemeral_artifacts as import('@/lib/types').ArchitecturalArtifacts | undefined) ?? item.artifacts_json ?? null}
        skipFetch={item.ephemeral_artifacts !== undefined}
        onClose={() => setArtifactsOpen(false)}
      />

      {reportItems && (
        <ReportView
          items={reportItems}
          onClose={() => setReportItems(null)}
        />
      )}

      <AnimatePresence>
        {fsOpen && (
          <ImageFullscreen
            item={thumbs[activeImg]}
            onClose={() => setFsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
