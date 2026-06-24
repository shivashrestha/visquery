'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link2, FileText, Presentation, Film, Cloud,
  Upload, Loader2, CheckCircle2, AlertCircle, RefreshCw, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type SourceMethod = 'url' | 'pdf' | 'pptx' | 'video' | 's3';

interface IngestResult {
  source_type: string;
  discovered: number;
  enqueued: number;
  skipped: number;
  job_ids: string[];
  image_ids?: string[];
  errors?: string[];
}

interface IngestBatch {
  id: string;
  method: SourceMethod;
  label: string;
  startedAt: number;
  result?: IngestResult;
  error?: string;
  pending: boolean;
  jobs: Record<string, { status: string }>;
}

const METHODS: { id: SourceMethod; label: string; desc: string; icon: LucideIcon }[] = [
  { id: 'url',   label: 'URL',          desc: 'Scrape images from any webpage.',                  icon: Link2 },
  { id: 'pdf',   label: 'PDF',          desc: 'Extract embedded images from a PDF document.',     icon: FileText },
  { id: 'pptx',  label: 'PowerPoint',   desc: 'Pull every slide image from a .pptx deck.',        icon: Presentation },
  { id: 'video', label: 'Video',        desc: 'Sample keyframes from a video file or link.',      icon: Film },
  { id: 's3',    label: 'S3 bucket',    desc: 'Import an entire bucket of project imagery.',      icon: Cloud },
];

export default function SourcesSection() {
  const [method, setMethod] = useState<SourceMethod>('url');
  const [batches, setBatches] = useState<IngestBatch[]>([]);

  const pushBatch = useCallback((b: IngestBatch) => {
    setBatches((prev) => [b, ...prev].slice(0, 20));
  }, []);

  const updateBatch = useCallback((id: string, patch: Partial<IngestBatch>) => {
    setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  // Poll job statuses while any batch has pending jobs
  useEffect(() => {
    const activeJobIds = batches
      .flatMap((b) =>
        Object.entries(b.jobs ?? {})
          .filter(([, v]) => v.status !== 'finished' && v.status !== 'failed')
          .map(([k]) => k),
      );
    if (activeJobIds.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/studio/sources/jobs-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_ids: activeJobIds }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setBatches((prev) => prev.map((b) => {
          const next = { ...b, jobs: { ...b.jobs } };
          for (const [jid, info] of Object.entries((data.jobs ?? {}) as Record<string, { status: string }>)) {
            if (next.jobs[jid]) next.jobs[jid] = { status: info.status };
          }
          return next;
        }));
      } catch { /* ignore */ }
    };
    const iv = setInterval(tick, 4000);
    tick();
    return () => { cancelled = true; clearInterval(iv); };
  }, [batches]);

  const handleResult = useCallback((id: string, _method: SourceMethod, _label: string, result: IngestResult | null, error?: string) => {
    if (error) {
      updateBatch(id, { pending: false, error });
      return;
    }
    if (!result) return;
    const jobs: Record<string, { status: string }> = {};
    for (const jid of result.job_ids ?? []) jobs[jid] = { status: 'queued' };
    updateBatch(id, { pending: false, result, jobs });
  }, [updateBatch]);

  // ─── URL form ──────────────────────────────
  const [url, setUrl] = useState('');
  const [urlMax, setUrlMax] = useState(40);
  const [urlSubmitting, setUrlSubmitting] = useState(false);

  async function submitUrl() {
    if (!url.trim()) return;
    setUrlSubmitting(true);
    const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pushBatch({ id, method: 'url', label: url, startedAt: Date.now(), pending: true, jobs: {} });
    try {
      const res = await fetch('/api/studio/sources/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), max_images: urlMax }),
      });
      const data = await res.json();
      handleResult(id, 'url', url, res.ok ? data : null, !res.ok ? (data.error ?? data.detail ?? `Error ${res.status}`) : undefined);
      if (res.ok) setUrl('');
    } catch (e) {
      handleResult(id, 'url', url, null, (e as Error).message);
    } finally {
      setUrlSubmitting(false);
    }
  }

  // ─── File upload (PDF / PPTX / Video) ──────
  const [file, setFile] = useState<File | null>(null);
  const [fileSubmitting, setFileSubmitting] = useState(false);
  const [videoMaxFrames, setVideoMaxFrames] = useState(20);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function openFilePicker() { fileInputRef.current?.click(); }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }
  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  async function submitFile(m: 'pdf' | 'pptx' | 'video') {
    if (!file) return;
    setFileSubmitting(true);
    const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pushBatch({ id, method: m, label: file.name, startedAt: Date.now(), pending: true, jobs: {} });
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (m === 'video') fd.append('max_frames', String(videoMaxFrames));
      const res = await fetch(`/api/studio/sources/${m}`, { method: 'POST', body: fd });
      const data = await res.json();
      handleResult(id, m, file.name, res.ok ? data : null, !res.ok ? (data.error ?? data.detail ?? `Error ${res.status}`) : undefined);
      if (res.ok) setFile(null);
    } catch (e) {
      handleResult(id, m, file.name, null, (e as Error).message);
    } finally {
      setFileSubmitting(false);
    }
  }

  // ─── S3 form ───────────────────────────────
  const [s3, setS3] = useState({
    bucket: '', region: 'us-east-1', access_key_id: '', secret_access_key: '',
    session_token: '', endpoint_url: '', prefix: '', max_images: 100,
  });
  const [s3Submitting, setS3Submitting] = useState(false);

  async function submitS3() {
    if (!s3.bucket || !s3.access_key_id || !s3.secret_access_key) return;
    setS3Submitting(true);
    const id = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    pushBatch({ id, method: 's3', label: `s3://${s3.bucket}/${s3.prefix}`, startedAt: Date.now(), pending: true, jobs: {} });
    try {
      const payload: Record<string, unknown> = {
        bucket: s3.bucket, region: s3.region,
        access_key_id: s3.access_key_id, secret_access_key: s3.secret_access_key,
        prefix: s3.prefix, max_images: s3.max_images,
      };
      if (s3.session_token) payload.session_token = s3.session_token;
      if (s3.endpoint_url) payload.endpoint_url = s3.endpoint_url;
      const res = await fetch('/api/studio/sources/s3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      handleResult(id, 's3', `s3://${s3.bucket}/${s3.prefix}`, res.ok ? data : null, !res.ok ? (data.error ?? data.detail ?? `Error ${res.status}`) : undefined);
      if (res.ok) setS3((p) => ({ ...p, access_key_id: '', secret_access_key: '', session_token: '' }));
    } catch (e) {
      handleResult(id, 's3', `s3://${s3.bucket}/${s3.prefix}`, null, (e as Error).message);
    } finally {
      setS3Submitting(false);
    }
  }

  const current = METHODS.find((m) => m.id === method)!;
  const CurrentIcon = current.icon;

  return (
    <div className="vqs-sources">
      <header className="vqs-sources-head vqs-rise">
        <p className="vqs-eyebrow">Studio · Sources</p>
        <h1 className="vqs-serif">
          Add images from <em>any source</em>
        </h1>
        <p>
          Ingest images into your private architectural library. Each image is automatically
          embedded and analysed by our vision model — style, materials, structural elements,
          and full artifact metadata.
        </p>
      </header>

      <div className="vqs-source-tabs vqs-rise" role="tablist">
        {METHODS.map((m) => {
          const Icon = m.icon;
          const active = method === m.id;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={active}
              className={`vqs-source-tab${active ? ' is-active' : ''}`}
              onClick={() => setMethod(m.id)}
            >
              <Icon size={15} /> {m.label}
            </button>
          );
        })}
      </div>

      <p className="vqs-source-blurb">{current.desc}</p>

      <div className="vqs-source-form vqs-rise">
        {method === 'url' && (
          <motion.div
            key="url"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <label className="vqs-source-field">
              <span className="vqs-source-field-label">Webpage URL</span>
              <input
                className="vqs-input"
                type="url"
                placeholder="https://example.com/portfolio"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>

            <div>
              <div className="vqs-source-range-label">
                <span>Max images to ingest</span>
                <span className="vqs-source-range-val">{urlMax}</span>
              </div>
              <input
                type="range" min={1} max={60} value={urlMax}
                onChange={(e) => setUrlMax(Number(e.target.value))}
                className="vqs-range"
              />
            </div>

            <div className="vqs-source-actions">
              <button
                className="vqs-btn vqs-btn--primary"
                onClick={submitUrl}
                disabled={!url.trim() || urlSubmitting}
              >
                {urlSubmitting ? <Loader2 className="vqs-spin" size={15} /> : <Upload size={15} />}
                Scrape &amp; ingest
              </button>
              <span className="vqs-source-actions-hint">Vision analysis runs automatically on ingest.</span>
            </div>
          </motion.div>
        )}

        {(method === 'pdf' || method === 'pptx' || method === 'video') && (
          <motion.div
            key={method}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <label
              className={`vqs-drop${dragOver ? ' is-over' : ''}${file ? ' has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={(e) => { if (!file) { e.preventDefault(); openFilePicker(); } }}
            >
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept={method === 'pdf' ? '.pdf,application/pdf' : method === 'pptx' ? '.pptx,.ppt' : 'video/*'}
                onChange={onFileChange}
              />
              {file ? (
                <div className="vqs-file-row">
                  <div>
                    <p className="vqs-file-name">{file.name}</p>
                    <p className="vqs-file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button
                    className="vqs-file-clear"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFile(null); }}
                    aria-label="Clear file"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="vqs-drop-ico"><CurrentIcon size={30} /></div>
                  <p className="vqs-drop-text">Drop your {current.label} file here</p>
                  <p className="vqs-drop-hint">
                    {method === 'pdf'
                      ? '.pdf · up to 25 MB · click or drop'
                      : method === 'pptx'
                        ? '.pptx · up to 25 MB · click or drop'
                        : '.mp4 · .mov · .webm · up to 100 MB'}
                  </p>
                </>
              )}
            </label>

            {method === 'video' && (
              <div>
                <div className="vqs-source-range-label">
                  <span>Frames to sample</span>
                  <span className="vqs-source-range-val">{videoMaxFrames}</span>
                </div>
                <input
                  type="range" min={1} max={20} value={videoMaxFrames}
                  onChange={(e) => setVideoMaxFrames(Number(e.target.value))}
                  className="vqs-range"
                />
              </div>
            )}

            <div className="vqs-source-actions">
              <button
                className="vqs-btn vqs-btn--primary"
                onClick={() => submitFile(method)}
                disabled={!file || fileSubmitting}
              >
                {fileSubmitting ? <Loader2 className="vqs-spin" size={15} /> : <Upload size={15} />}
                Upload &amp; analyse
              </button>
              <span className="vqs-source-actions-hint">Vision analysis runs automatically on ingest.</span>
            </div>
          </motion.div>
        )}

        {method === 's3' && (
          <motion.div
            key="s3"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div className="vqs-source-form-row">
              <label className="vqs-source-field">
                <span className="vqs-source-field-label">Bucket name</span>
                <input
                  className="vqs-input"
                  value={s3.bucket}
                  onChange={(e) => setS3({ ...s3, bucket: e.target.value })}
                  placeholder="my-studio-archive"
                />
              </label>
              <label className="vqs-source-field">
                <span className="vqs-source-field-label">Region</span>
                <input
                  className="vqs-input"
                  value={s3.region}
                  onChange={(e) => setS3({ ...s3, region: e.target.value })}
                  placeholder="us-east-1"
                />
              </label>
            </div>

            <label className="vqs-source-field">
              <span className="vqs-source-field-label">Access key ID</span>
              <input
                className="vqs-input"
                type="password"
                autoComplete="off"
                value={s3.access_key_id}
                onChange={(e) => setS3({ ...s3, access_key_id: e.target.value })}
                placeholder="AKIA…"
              />
            </label>

            <label className="vqs-source-field">
              <span className="vqs-source-field-label">Secret access key</span>
              <input
                className="vqs-input"
                type="password"
                autoComplete="off"
                value={s3.secret_access_key}
                onChange={(e) => setS3({ ...s3, secret_access_key: e.target.value })}
                placeholder="••••••••••••••••"
              />
            </label>

            <details className="vqs-source-details">
              <summary>Advanced (session token, custom endpoint)</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
                <label className="vqs-source-field">
                  <span className="vqs-source-field-label">Session token (optional)</span>
                  <input
                    className="vqs-input"
                    type="password"
                    autoComplete="off"
                    value={s3.session_token}
                    onChange={(e) => setS3({ ...s3, session_token: e.target.value })}
                  />
                </label>
                <label className="vqs-source-field">
                  <span className="vqs-source-field-label">Endpoint URL (R2 / B2 / MinIO)</span>
                  <input
                    className="vqs-input"
                    value={s3.endpoint_url}
                    onChange={(e) => setS3({ ...s3, endpoint_url: e.target.value })}
                    placeholder="https://your-account.r2.cloudflarestorage.com"
                  />
                </label>
              </div>
            </details>

            <div className="vqs-source-form-row">
              <label className="vqs-source-field">
                <span className="vqs-source-field-label">Prefix (optional)</span>
                <input
                  className="vqs-input"
                  value={s3.prefix}
                  onChange={(e) => setS3({ ...s3, prefix: e.target.value })}
                  placeholder="projects/2024/"
                />
              </label>
              <div>
                <div className="vqs-source-range-label">
                  <span>Max images</span>
                  <span className="vqs-source-range-val">{s3.max_images}</span>
                </div>
                <input
                  type="range" min={1} max={200} value={s3.max_images}
                  onChange={(e) => setS3({ ...s3, max_images: Number(e.target.value) })}
                  className="vqs-range"
                />
              </div>
            </div>

            <p className="vqs-source-warn">
              <AlertCircle size={12} /> Credentials are used only for this request and never stored.
            </p>

            <div className="vqs-source-actions">
              <button
                className="vqs-btn vqs-btn--primary"
                onClick={submitS3}
                disabled={!s3.bucket || !s3.access_key_id || !s3.secret_access_key || s3Submitting}
              >
                {s3Submitting ? <Loader2 className="vqs-spin" size={15} /> : <Upload size={15} />}
                Connect &amp; import
              </button>
              <span className="vqs-source-actions-hint">Bucket access is read-only.</span>
            </div>
          </motion.div>
        )}
      </div>

      {batches.length > 0 && (
        <div className="vqs-source-history vqs-rise">
          <p className="vqs-eyebrow" style={{ color: 'var(--vqs-muted)', marginBottom: 14 }}>
            Recent ingests
          </p>
          <div className="vqs-source-history-card">
            <AnimatePresence>
              {batches.map((b) => {
                const total = Object.keys(b.jobs ?? {}).length;
                const done = Object.values(b.jobs ?? {}).filter((j) => j.status === 'finished' || j.status === 'failed').length;
                const failed = Object.values(b.jobs ?? {}).filter((j) => j.status === 'failed').length;
                const MethodIcon = METHODS.find((m) => m.id === b.method)?.icon ?? Upload;
                return (
                  <motion.div
                    key={b.id}
                    className="vqs-batch"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="vqs-batch-head">
                      <span className="vqs-batch-method"><MethodIcon size={16} /></span>
                      <div className="vqs-batch-label-wrap">
                        <div className="vqs-batch-label" title={b.label}>{b.label}</div>
                        <div className="vqs-batch-sub">
                          {b.method.toUpperCase()}
                          {b.result ? ` · ${b.result.enqueued} queued · ${b.result.discovered} found` : ' · pending'}
                        </div>
                      </div>
                      <span className="vqs-batch-time">{new Date(b.startedAt).toLocaleTimeString()}</span>
                    </div>

                    {b.pending && (
                      <div className="vqs-batch-status">
                        <Loader2 className="vqs-spin" size={13} /> Discovering &amp; downloading…
                      </div>
                    )}

                    {b.error && (
                      <div className="vqs-batch-err">
                        <AlertCircle size={13} /> {b.error}
                      </div>
                    )}

                    {b.result && (
                      <>
                        <div className="vqs-batch-stats">
                          <span><strong>{b.result.discovered}</strong>found</span>
                          <span><strong>{b.result.enqueued}</strong>queued</span>
                          {b.result.skipped > 0 && (
                            <span><strong>{b.result.skipped}</strong>skipped</span>
                          )}
                        </div>
                        {total > 0 && (
                          <div className="vqs-progress">
                            <div className="vqs-progress-bar">
                              <div className="vqs-progress-fill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                            </div>
                            <p className="vqs-progress-text">
                              {done === total ? (
                                <span className="vqs-batch-done">
                                  <CheckCircle2 size={12} /> Processed {done}/{total}{failed > 0 ? ` (${failed} failed)` : ''}
                                </span>
                              ) : (
                                <>
                                  <RefreshCw className="vqs-spin" size={12} /> Processing {done}/{total}…
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
