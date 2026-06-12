'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, X } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import {
  generatePrecedentReport,
  reportPdfUrl,
  type PrecedentReport,
  type ReportFocus,
} from '@/lib/api';

interface ReportViewProps {
  items: SearchResultItem[];
  focus?: ReportFocus;
  onClose: () => void;
}

/** Inline markdown: **bold**, *italic*, and [IMG-n] citation chips. */
function renderInline(
  text: string,
  refMap: Map<number, { title: string; thumb: string | null }>,
): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[IMG-\d+\])/g);
  return tokens.map((tok, i) => {
    const cite = tok.match(/^\[IMG-(\d+)\]$/);
    if (cite) {
      const ref = Number(cite[1]);
      const entry = refMap.get(ref);
      return (
        <span key={i} className="report-cite" title={entry?.title ?? `Image ${ref}`}>
          {entry?.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.thumb} alt="" className="report-cite-thumb" />
          )}
          IMG-{ref}
        </span>
      );
    }
    if (tok.startsWith('**') && tok.endsWith('**')) return <b key={i}>{tok.slice(2, -2)}</b>;
    if (tok.startsWith('*') && tok.endsWith('*')) return <i key={i}>{tok.slice(1, -1)}</i>;
    return <span key={i}>{tok}</span>;
  });
}

function renderBody(
  body: string,
  refMap: Map<number, { title: string; thumb: string | null }>,
): React.ReactNode {
  return body
    .split(/\n\n+/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para, pi) => {
      if (/^[-*] /.test(para)) {
        const lines = para.split('\n').map((l) => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
        return (
          <ul key={pi} className="report-list">
            {lines.map((l, li) => <li key={li}>{renderInline(l, refMap)}</li>)}
          </ul>
        );
      }
      return <p key={pi}>{renderInline(para.replace(/\n/g, ' '), refMap)}</p>;
    });
}

/**
 * Full-screen overlay: generates a comparative precedent report from the
 * selected items on mount, renders sections with inline [IMG-n] citation
 * thumbnails, and offers a server-rendered PDF download.
 */
export default function ReportView({ items, focus, onClose }: ReportViewProps) {
  const [report, setReport] = useState<PrecedentReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    generatePrecedentReport(items, focus)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Report generation failed');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map IMG-n refs → display thumbnails. Stored refs match by image_id;
  // ephemeral entries (image_id null) fall back to the items' local blob URLs.
  const refMap = useMemo(() => {
    const map = new Map<number, { title: string; thumb: string | null }>();
    if (!report) return map;
    const byId = new Map(items.map((it) => [it.image_id, it]));
    const ephemerals = items.filter(
      (it) => it.ephemeral_artifacts || it.image_id.startsWith('ephemeral-'),
    );
    let ephIdx = 0;
    for (const entry of report.images) {
      let thumb: string | null = null;
      if (entry.image_id) {
        thumb = byId.get(entry.image_id)?.image_url ?? `/api/images/${entry.image_id}/raw`;
      } else {
        thumb = ephemerals[ephIdx]?.image_url ?? null;
        ephIdx += 1;
      }
      map.set(entry.ref, { title: entry.title, thumb });
    }
    return map;
  }, [report, items]);

  return (
    <AnimatePresence>
      <motion.div
        className="report-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="report-modal"
          initial={{ opacity: 0, scale: 0.97, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 18 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="report-header">
            <div className="report-header-title">
              <FileText size={13} />
              <span>Precedent Study</span>
              {report && (
                <span className="report-count">
                  {report.images.length} precedents{report.cached ? ' · cached' : ''}
                </span>
              )}
            </div>
            <div className="report-header-actions">
              {report && (
                <a className="btn-primary report-download" href={reportPdfUrl(report.report_id)}>
                  <Download size={12} />
                  Download PDF
                </a>
              )}
              <button className="report-close" onClick={onClose} aria-label="Close report">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="report-body">
            {!report && !error && (
              <div className="report-loading">
                <div className="report-loading-pulse" />
                <p className="report-loading-title">Synthesizing precedent study</p>
                <p className="report-loading-sub">
                  Comparing {items.length} precedents — typology, materials, structure, climate
                </p>
              </div>
            )}

            {error && (
              <div className="report-error">
                <p>{error}</p>
                <button className="btn-ghost" onClick={onClose}>Close</button>
              </div>
            )}

            {report && (
              <article className="report-article">
                {/* Image strip */}
                <div className="report-strip">
                  {report.images.map((entry) => {
                    const e = refMap.get(entry.ref);
                    return (
                      <figure key={entry.ref} className="report-strip-item">
                        {e?.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.thumb} alt={entry.title} />
                        ) : (
                          <div className="report-strip-placeholder" />
                        )}
                        <figcaption>
                          <span className="report-strip-ref">IMG-{entry.ref}</span>
                          {entry.title}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>

                {report.sections.map((sec) => (
                  <section key={sec.heading} className="report-section">
                    <h2>{sec.heading}</h2>
                    <div className="report-prose">{renderBody(sec.body_md, refMap)}</div>
                  </section>
                ))}

                <p className="report-colophon">
                  Generated {report.generated_at.slice(0, 10)}
                  {report.focus ? ` · focus: ${report.focus}` : ''} · Visquery
                </p>
              </article>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
