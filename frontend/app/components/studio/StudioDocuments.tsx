'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Presentation, Loader2, AlertCircle, Trash2,
  Sparkles, Send, Archive, X, Layers,
} from 'lucide-react';
import {
  chatArchive, deleteArchiveSource, getArchiveStatus,
  type ArchiveSource, type ArchiveStatus, type ArchiveCitation,
} from '@/lib/api';

type Msg = { who: 'user' | 'ai'; text: string; citations?: ArchiveCitation[] };

const ALL = '__all__';
const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued', indexing: 'Indexing…', ready: 'Ready', failed: 'Failed',
};

/**
 * Documents — a full chat workspace over the firm's indexed PDF/PPTX archive.
 * Left: document list (the "threads"). Right: ChatGPT-style conversation,
 * one thread per selected document (or All documents).
 */
export default function StudioDocuments() {
  const [status, setStatus] = useState<ArchiveStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [scope, setScope] = useState<string>(ALL); // doc id or ALL
  const [deleting, setDeleting] = useState<string | null>(null);

  // Per-thread conversation, keyed by scope (docId | ALL)
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [activeCitation, setActiveCitation] = useState<ArchiveCitation | null>(null);

  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const s = await getArchiveStatus();
    setStatus(s);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while any document is still indexing
  useEffect(() => {
    const pending = (status?.sources ?? []).some(
      (s) => s.index_status === 'queued' || s.index_status === 'indexing',
    );
    if (!pending) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [status, load]);

  const msgs = threads[scope] ?? [];
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [msgs, thinking, scope]);

  const docs = status?.sources ?? [];
  const readyDocs = docs.filter((d) => d.index_status === 'ready' && d.chunk_count > 0);
  const scopedDoc = scope === ALL ? null : docs.find((d) => d.source_id === scope) ?? null;
  const canChat = scope === ALL ? readyDocs.length > 0 : scopedDoc?.index_status === 'ready';

  const ask = useCallback(async (q: string) => {
    const key = scope;
    setThreads((t) => ({ ...t, [key]: [...(t[key] ?? []), { who: 'user', text: q }] }));
    setDraft('');
    setThinking(true);
    setActiveCitation(null);
    try {
      const history = (threads[key] ?? []).map((m) => ({ who: m.who, text: m.text }));
      const res = await chatArchive(q, history, key === ALL ? undefined : [key]);
      setThreads((t) => ({
        ...t,
        [key]: [...(t[key] ?? []), { who: 'ai', text: res.answer, citations: res.citations }],
      }));
    } catch {
      setThreads((t) => ({
        ...t,
        [key]: [...(t[key] ?? []), { who: 'ai', text: 'Unable to answer right now.' }],
      }));
    } finally {
      setThinking(false);
    }
  }, [scope, threads]);

  async function handleDelete(d: ArchiveSource) {
    if (!window.confirm(`Remove "${d.title}" from the archive? Its indexed text will be deleted.`)) return;
    setDeleting(d.source_id);
    try {
      await deleteArchiveSource(d.source_id);
      if (scope === d.source_id) setScope(ALL);
      await load();
    } catch { /* next poll reflects truth */ }
    setDeleting(null);
  }

  function submit() {
    const q = draft.trim();
    if (q && !thinking && canChat) ask(q);
  }

  return (
    <div className="vqs-docs">
      {/* ── Left: document list ── */}
      <aside className="vqs-docs-rail">
        <div className="vqs-docs-rail-head">
          <span className="vqs-tb-tag">Archive</span>
          <h2 className="vqs-docs-rail-title">Documents</h2>
          <p className="vqs-docs-rail-sub">{docs.length} indexed · ask questions, get cited answers</p>
        </div>

        <button
          className={`vqs-doc-item vqs-doc-all${scope === ALL ? ' is-active' : ''}`}
          onClick={() => setScope(ALL)}
          disabled={readyDocs.length === 0}
        >
          <span className="vqs-doc-ico"><Layers size={15} /></span>
          <span className="vqs-doc-body">
            <span className="vqs-doc-title">All documents</span>
            <span className="vqs-doc-sub">{readyDocs.length} ready to query</span>
          </span>
        </button>

        <div className="vqs-docs-list">
          {!loaded && (
            <div className="vqs-docs-loading"><Loader2 size={14} className="vqs-spin" /> Loading…</div>
          )}
          {loaded && docs.length === 0 && (
            <div className="vqs-docs-empty-rail">
              <Archive size={20} />
              <p>No documents yet.</p>
              <p className="vqs-docs-empty-hint">Upload a PDF or PowerPoint in Sources — it gets indexed for chat here.</p>
            </div>
          )}
          {docs.map((d) => {
            const active = scope === d.source_id;
            const ready = d.index_status === 'ready' && d.chunk_count > 0;
            return (
              <div key={d.source_id} className={`vqs-doc-item${active ? ' is-active' : ''}${!ready ? ' is-disabled' : ''}`}>
                <button
                  className="vqs-doc-select"
                  onClick={() => ready && setScope(d.source_id)}
                  disabled={!ready}
                  title={ready ? `Chat about ${d.title}` : STATUS_LABEL[d.index_status]}
                >
                  <span className="vqs-doc-ico">
                    {d.file_type === 'pdf' ? <FileText size={15} /> : <Presentation size={15} />}
                  </span>
                  <span className="vqs-doc-body">
                    <span className="vqs-doc-title">{d.title}</span>
                    <span className="vqs-doc-sub">
                      {d.index_status === 'indexing' || d.index_status === 'queued' ? (
                        <><Loader2 size={10} className="vqs-spin" /> {STATUS_LABEL[d.index_status]}</>
                      ) : d.index_status === 'failed' ? (
                        <><AlertCircle size={10} /> Failed</>
                      ) : (
                        `${d.page_count != null ? `${d.page_count}p · ` : ''}${d.chunk_count} chunks`
                      )}
                    </span>
                  </span>
                </button>
                <button
                  className="vqs-doc-del"
                  onClick={() => handleDelete(d)}
                  disabled={deleting === d.source_id}
                  aria-label={`Delete ${d.title}`}
                  title="Remove from archive"
                >
                  {deleting === d.source_id ? <Loader2 size={13} className="vqs-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Right: chat ── */}
      <section className="vqs-chat">
        <div className="vqs-chat-head">
          <div className="vqs-chat-head-txt">
            <span className="vqs-chat-scope">
              {scopedDoc ? scopedDoc.title : 'All documents'}
            </span>
            <span className="vqs-chat-scope-sub">
              {scopedDoc
                ? `${scopedDoc.page_count != null ? `${scopedDoc.page_count} pages · ` : ''}${scopedDoc.chunk_count} chunks indexed`
                : `${readyDocs.length} document${readyDocs.length === 1 ? '' : 's'} in scope`}
            </span>
          </div>
        </div>

        <div className="vqs-chat-stream" ref={streamRef}>
          {msgs.length === 0 && !thinking && (
            <div className="vqs-chat-welcome">
              <div className="vqs-chat-welcome-ico"><Sparkles size={22} /></div>
              <h3>{scopedDoc ? `Ask about ${scopedDoc.title}` : 'Ask the archive'}</h3>
              <p>
                {canChat
                  ? 'Answers are grounded in the indexed text and cite the exact page.'
                  : 'No indexed documents in scope yet. Upload a PDF or PowerPoint in Sources to start.'}
              </p>
              {canChat && (
                <div className="vqs-chat-suggest">
                  {['Summarise the key points', 'What does this say about materials?', 'List every project mentioned'].map((s) => (
                    <button key={s} className="vqs-chip" onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={i} className={`vqs-msg vqs-msg-${m.who}`}>
              {m.who === 'ai' && <span className="vqs-msg-avatar"><Sparkles size={12} /></span>}
              <div className="vqs-msg-col">
                <div className="vqs-msg-bubble">{m.text}</div>
                {m.who === 'ai' && (m.citations?.length ?? 0) > 0 && (
                  <div className="vqs-msg-cites">
                    {m.citations!.map((c, ci) => (
                      <button
                        key={`${c.source_id}-${c.page}-${ci}`}
                        className="vqs-cite-chip"
                        onClick={() => setActiveCitation(c)}
                        title={`${c.title} — page ${c.page}`}
                      >
                        <FileText size={10} />
                        {c.title.length > 24 ? `${c.title.slice(0, 24)}…` : c.title}, p.{c.page}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="vqs-msg vqs-msg-ai">
              <span className="vqs-msg-avatar"><Sparkles size={12} /></span>
              <div className="vqs-msg-col">
                <div className="vqs-msg-bubble vqs-msg-thinking">
                  <Loader2 size={12} className="vqs-spin" /> reading the archive…
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Citation snippet */}
        {activeCitation && (
          <motion.div
            className="vqs-cite-drawer"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="vqs-cite-drawer-head">
              <div>
                <div className="vqs-cite-drawer-title">{activeCitation.title}</div>
                <div className="vqs-cite-drawer-page">Page {activeCitation.page}</div>
              </div>
              <button className="vqs-cite-drawer-close" onClick={() => setActiveCitation(null)} aria-label="Close">
                <X size={13} />
              </button>
            </div>
            <p className="vqs-cite-drawer-snippet">{activeCitation.snippet}</p>
          </motion.div>
        )}

        {/* Composer */}
        <div className="vqs-chat-composer">
          <div className="vqs-chat-input-wrap">
            <textarea
              ref={inputRef}
              className="vqs-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder={canChat ? 'Ask anything about the documents…' : 'No indexed documents in scope'}
              rows={1}
              disabled={!canChat}
            />
            <button
              className="vqs-chat-send"
              onClick={submit}
              disabled={!draft.trim() || thinking || !canChat}
              aria-label="Send"
            >
              {thinking ? <Loader2 size={15} className="vqs-spin" /> : <Send size={15} />}
            </button>
          </div>
          <p className="vqs-chat-foot">Answers cite the source page · Enter to send, Shift+Enter for newline</p>
        </div>
      </section>
    </div>
  );
}
