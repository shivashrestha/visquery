'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight, ChevronRight, Database, FolderOpen,
  Image as ImageIcon, Layers, Search as SearchIcon,
  Upload, User as UserIcon, Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import { listImages } from '@/lib/api';

import type { StudioSection } from './StudioSidebar';

interface StudioOverviewProps {
  user: { name: string };
  onNavigate: (section: StudioSection) => void;
  onSearchChip: (q: string) => void;
  onOpenItem: (item: SearchResultItem) => void;
}

const QUICK_STYLES = [
  'Brutalism', 'Beaux-Arts', 'Bauhaus', 'Achaemenid', 'Postmodern', 'Gothic Revival',
];

const ACTIONS: { id: StudioSection; icon: LucideIcon; title: string; desc: string }[] = [
  { id: 'search',  icon: SearchIcon, title: 'Search precedents',   desc: 'Search by text or upload an image to find visual matches.' },
  { id: 'library', icon: FolderOpen, title: 'Browse your library', desc: 'View every image you and your studio have ingested.' },
  { id: 'sources', icon: Database,   title: 'Add image sources',   desc: 'URL, PDF, PowerPoint, video frames, or S3 bucket.' },
  { id: 'account', icon: UserIcon,   title: 'Account & plan',      desc: 'Manage your Studio access and view usage.' },
];

export default function StudioOverview({
  user, onNavigate, onSearchChip, onOpenItem,
}: StudioOverviewProps) {
  const [recent, setRecent] = useState<SearchResultItem[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listImages(0, 8, 'created_at_desc')
      .then((data) => {
        if (cancelled) return;
        setRecent(data.results);
        setTotal(data.total);
      })
      .catch(() => {
        if (cancelled) return;
        setRecent([]);
        setTotal(0);
      });
    return () => { cancelled = true; };
  }, []);

  const stats: { k: string; v: string; i: LucideIcon }[] = [
    { k: total === null ? '—' : String(total), v: 'Images in library', i: ImageIcon },
    { k: '120+', v: 'Styles recognised', i: Layers },
    { k: '5',    v: 'Ingest methods',    i: Database },
    { k: '1.2k', v: 'Precedents indexed', i: Globe },
  ];

  const firstName = user.name.split(' ')[0] || 'there';

  return (
    <div className="vqs-page">
      <p className="vqs-eyebrow vqs-rise">Welcome back</p>
      <h1 className="vqs-serif vqs-hero-h1 vqs-rise">
        {firstName}, your workspace is <em>ready.</em>
      </h1>
      <p className="vqs-hero-sub vqs-rise">
        Your private architectural intelligence workspace. Ingest project images five ways,
        search the global precedent index, and chat with any building.
      </p>

      <div className="vqs-cta-row vqs-rise">
        <button className="vqs-btn vqs-btn--primary" onClick={() => onNavigate('sources')}>
          <Upload size={16} /> Add image sources
        </button>
        <button className="vqs-btn vqs-btn--ghost" onClick={() => onNavigate('search')}>
          <SearchIcon size={16} /> Search precedents
        </button>
      </div>

      <div className="vqs-stats vqs-rise">
        {stats.map(({ k, v, i: Icon }) => (
          <div key={v} className="vqs-stat">
            <div className="vqs-stat-ico"><Icon size={18} /></div>
            <div className="vqs-stat-k">{k}</div>
            <div className="vqs-stat-v">{v}</div>
          </div>
        ))}
      </div>

      <div className="vqs-action-grid">
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              className="vqs-action vqs-rise"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => onNavigate(a.id)}
            >
              <span className="vqs-action-ico"><Icon size={19} /></span>
              <span className="vqs-action-body">
                <span className="vqs-action-title">{a.title}</span>
                <span className="vqs-action-desc">{a.desc}</span>
              </span>
              <ChevronRight size={16} className="vqs-action-arrow" />
            </button>
          );
        })}
      </div>

      {recent && recent.length > 0 && (
        <div className="vqs-rise">
          <div className="vqs-section-head">
            <p className="vqs-eyebrow" style={{ color: 'var(--vqs-muted)' }}>
              Recently added to your library
            </p>
            <button className="vqs-link" onClick={() => onNavigate('library')}>
              View library <ArrowRight size={13} />
            </button>
          </div>
          <div className="vqs-scroll-x">
            {recent.slice(0, 8).map((it) => {
              const style =
                (it.image_metadata?.architecture_style_classified as string | undefined) ??
                it.tags?.[0] ??
                '';
              const title =
                (it.image_metadata?.title as string | undefined) ??
                it.metadata.architect ??
                'Untitled';
              const sub = [
                it.metadata.materials?.[0],
                it.metadata.typology?.[0]?.replace(/_/g, ' '),
              ].filter(Boolean).join(' · ');
              return (
                <button
                  key={it.image_id}
                  className="vqs-recent-card"
                  onClick={() => onOpenItem(it)}
                >
                  <div className="vqs-recent-img">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={title} loading="lazy" />
                    ) : null}
                    {style && <span className="vqs-recent-style">{style}</span>}
                  </div>
                  <div className="vqs-recent-meta">
                    <p className="vqs-recent-title">{title}</p>
                    {sub && <p className="vqs-recent-sub">{sub}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="vqs-quick vqs-rise">
        <p className="vqs-eyebrow" style={{ color: 'var(--vqs-muted)', marginBottom: 14 }}>
          Quick search
        </p>
        <div className="vqs-quick-chips">
          {QUICK_STYLES.map((q) => (
            <button key={q} className="vqs-chip" onClick={() => onSearchChip(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
