'use client';

import { Check, LogOut } from 'lucide-react';
import type { StudioUser } from './StudioLanding';

interface StudioAccountProps {
  user: StudioUser;
  onLogout: () => void;
  usage?: { libraryImages: number; searchesThisMonth: number; ingestJobs: number };
}

const PLAN_INCLUDES = [
  'Unlimited search across the global precedent index',
  'Private project image library',
  '5 image-source ingestion methods (URL · PDF · PPTX · Video · S3)',
  'AI artifact extraction on every image',
  'Per-image RAG chat with grounded answers',
  'Visual similarity search across your library',
];

const USAGE_CAPS = {
  libraryImages: 500,
  searchesThisMonth: 1000,
  ingestJobs: 50,
};

export default function StudioAccount({
  user, onLogout,
  usage = { libraryImages: 0, searchesThisMonth: 0, ingestJobs: 0 },
}: StudioAccountProps) {
  const rows: { k: string; v: string; accent?: boolean }[] = [
    { k: 'Name',  v: user.name },
    { k: 'Email', v: user.email },
    { k: 'Role',  v: user.role },
    { k: 'Plan',  v: user.plan.toUpperCase(), accent: true },
  ];

  const meters: { label: string; used: number; cap: number }[] = [
    { label: 'Library images',         used: usage.libraryImages,      cap: USAGE_CAPS.libraryImages },
    { label: 'Searches this month',    used: usage.searchesThisMonth,  cap: USAGE_CAPS.searchesThisMonth },
    { label: 'Ingest jobs',            used: usage.ingestJobs,         cap: USAGE_CAPS.ingestJobs },
  ];

  return (
    <div className="vqs-page" style={{ maxWidth: 780 }}>
      <p className="vqs-eyebrow vqs-rise">Account</p>
      <h1 className="vqs-serif vqs-hero-h1 vqs-rise" style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', marginBottom: 28 }}>
        Your Studio access
      </h1>

      <div className="vqs-acct-grid vqs-rise">
        {rows.map((r) => (
          <div className="vqs-acct-row" key={r.k}>
            <span className="vqs-acct-key">{r.k}</span>
            <span className={`vqs-acct-val${r.accent ? ' vqs-acct-val--accent' : ''}`}>{r.v}</span>
          </div>
        ))}
      </div>

      <div className="vqs-usage-card vqs-rise">
        <p className="vqs-eyebrow" style={{ color: 'var(--vqs-muted)', marginBottom: 18 }}>
          Usage this cycle
        </p>
        <div className="vqs-usage-list">
          {meters.map((u) => {
            const pct = Math.min(100, Math.round((u.used / u.cap) * 100));
            return (
              <div className="vqs-usage-row" key={u.label}>
                <div className="vqs-usage-head">
                  <span className="vqs-usage-label">{u.label}</span>
                  <span className="vqs-usage-num">{u.used} / {u.cap}</span>
                </div>
                <div className="vqs-usage-bar">
                  <div className="vqs-usage-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="vqs-plan-card vqs-rise">
        <p className="vqs-eyebrow" style={{ color: 'var(--vqs-muted)', marginBottom: 16 }}>
          Studio plan includes
        </p>
        <div className="vqs-plan-grid">
          {PLAN_INCLUDES.map((p) => (
            <div className="vqs-plan-item" key={p}>
              <Check size={15} className="vqs-plan-check" /> <span>{p}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="vqs-signout" style={{ alignSelf: 'flex-start' }} onClick={onLogout}>
        <LogOut size={15} /><span>Sign out of Studio</span>
      </button>
    </div>
  );
}
