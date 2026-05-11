'use client';

import Image from 'next/image';

export type ViewName = 'home' | 'results' | 'library' | 'collections' | 'detail';

interface HeaderProps {
  view: ViewName;
  onNav: (v: ViewName) => void;
  resultCount?: number;
}

export default function Header({ view, onNav, resultCount }: HeaderProps) {
  return (
    <header className="hdr">
      <div className="hdr-left">
        <div className="brand" onClick={() => onNav('home')}>
          <Image
            src="/app-logo.png"
            alt="Visquery"
            width={100}
            height={100}
            quality={100}
            unoptimized
            style={{ objectFit: 'contain', flexShrink: 0 }}
          />
          <div className="brand-text">
            <span className="brand-name">Visquery</span>
            <span className="brand-sub">Visual query for architecture styles</span>
          </div>
        </div>
        <nav className="hdr-nav">
          <button
            className={view === 'home' || view === 'results' ? 'is-active' : ''}
            onClick={() => onNav('home')}
          >
            Search
          </button>
          <button
            className={view === 'library' ? 'is-active' : ''}
            onClick={() => onNav('library')}
          >
            Library
          </button>
          <button
            className={view === 'collections' ? 'is-active' : ''}
            onClick={() => onNav('collections')}
          >
            Collections
          </button>
        </nav>
      </div>
      <div className="hdr-right">
        <span className="hdr-meta">
          {resultCount !== undefined
            ? `${resultCount.toLocaleString()} results`
            : ''}
        </span>
      </div>
    </header>
  );
}
