'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Archive, ChevronDown, Loader2, Sparkles, X } from 'lucide-react';
import {
  chatArchive,
  type ArchiveCitation,
  type ArchiveSource,
} from '@/lib/api';

interface ArchiveChatModalProps {
  /** Ready documents available as scope options. */
  sources: ArchiveSource[];
  /** Pre-scoped source ids (per-document "Ask" shortcut). Empty = all. */
  initialScope?: string[];
  onClose: () => void;
}

type Msg = { who: 'user' | 'ai'; text: string; citations?: ArchiveCitation[] };

export default function ArchiveChatModal({ sources, initialScope, onClose }: ArchiveChatModalProps) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [scopeIds, setScopeIds] = useState<string[]>(initialScope ?? []);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<ArchiveCitation | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [msgs, thinking]);

  const scopedTitles = scopeIds.length
    ? sources.filter((s) => scopeIds.includes(s.source_id)).map((s) => s.title)
    : [];

  const ask = useCallback(async (q: string) => {
    setMsgs((m) => [...m, { who: 'user', text: q }]);
    setDraft('');
    setThinking(true);
    try {
      const history = msgs.map((m) => ({ who: m.who, text: m.text }));
      const res = await chatArchive(q, history, scopeIds.length ? scopeIds : undefined);
      setMsgs((m) => [...m, { who: 'ai', text: res.answer, citations: res.citations }]);
    } catch {
      setMsgs((m) => [...m, { who: 'ai', text: 'Unable to answer right now.' }]);
    } finally {
      setThinking(false);
    }
  }, [msgs, scopeIds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(3px)' }} onClick={onClose} />

      <motion.div
        className="archive-modal"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22 }}
      >
        {/* Header */}
        <div className="archive-modal-head">
          <div className="archive-modal-title-wrap">
            <Archive size={15} />
            <div>
              <div className="archive-modal-title">Ask the Archive</div>
              <div className="archive-modal-sub">
                {scopedTitles.length
                  ? scopedTitles.join(' · ')
                  : `All documents (${sources.length})`}
              </div>
            </div>
          </div>
          <div className="archive-modal-actions">
            {sources.length > 1 && (
              <span className="ask-scope-wrap">
                <button className="ask-scope-btn" onClick={() => setScopeOpen((o) => !o)}>
                  {scopeIds.length === 0 ? 'All documents' : `${scopeIds.length} selected`}
                  <ChevronDown size={10} />
                </button>
                {scopeOpen && (
                  <span className="ask-scope-pop" style={{ top: 'calc(100% + 6px)', bottom: 'auto', right: 0, left: 'auto' }}>
                    <label className="ask-scope-item">
                      <input
                        type="checkbox"
                        checked={scopeIds.length === 0}
                        onChange={() => setScopeIds([])}
                      />
                      All documents
                    </label>
                    {sources.map((d) => (
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
            <button className="archive-modal-close" onClick={onClose} aria-label="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Stream */}
        <div className="archive-modal-stream" ref={streamRef}>
          {msgs.length === 0 && !thinking && (
            <p className="archive-modal-empty">
              Ask anything about the firm&apos;s documents — answers cite the exact page.
            </p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.who}`}>
              <span className={`who${m.who === 'ai' ? ' ai-who' : ''}`}>
                {m.who === 'ai' && <Sparkles size={9} className="ai-icon" />}
                {m.who === 'user' ? 'You' : 'Visquery'}
              </span>
              <div className="bubble">{m.text}</div>
              {m.who === 'ai' && (m.citations?.length ?? 0) > 0 && (
                <div className="cite-chips">
                  {m.citations!.map((c, ci) => (
                    <button
                      key={`${c.source_id}-${c.page}-${ci}`}
                      className="cite-chip"
                      onClick={() => setActiveCitation(c)}
                      title={`${c.title} — page ${c.page}`}
                    >
                      {c.title.length > 26 ? `${c.title.slice(0, 26)}…` : c.title}, p.{c.page}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="msg ai">
              <span className="who ai-who"><Sparkles size={9} className="ai-icon" /> Visquery</span>
              <div className="bubble">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={11} className="vqs-spin" /> reading the archive…
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Citation snippet */}
        {activeCitation && (
          <div className="archive-modal-cite">
            <div className="cite-drawer-head">
              <div>
                <div className="cite-drawer-title">{activeCitation.title}</div>
                <div className="cite-drawer-page">Page {activeCitation.page}</div>
              </div>
              <button className="cite-drawer-close" onClick={() => setActiveCitation(null)} aria-label="Close citation">
                <X size={13} />
              </button>
            </div>
            <p className="cite-drawer-snippet">{activeCitation.snippet}</p>
          </div>
        )}

        {/* Input */}
        <div className="archive-modal-input">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask the archive…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim() && !thinking) ask(draft.trim());
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
      </motion.div>
    </div>
  );
}
