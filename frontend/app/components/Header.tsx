'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

export type ViewName = 'home' | 'results' | 'library' | 'collections' | 'detail';

interface HeaderProps {
  view: ViewName;
  onNav: (v: ViewName) => void;
  resultCount?: number;
}

export default function Header({ view, onNav, resultCount }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (v: ViewName) => {
    setMobileOpen(false);
    onNav(v);
  };

  return (
    <>
      <header className="hdr">
        <div className="hdr-left">
          <div className="brand" onClick={() => handleNav('home')}>
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
              onClick={() => handleNav('home')}
            >
              Search
            </button>
            <button
              className={view === 'library' ? 'is-active' : ''}
              onClick={() => handleNav('library')}
            >
              Library
            </button>
            <button
              className={view === 'collections' ? 'is-active' : ''}
              onClick={() => handleNav('collections')}
            >
              Collections
            </button>
          </nav>
        </div>
        <div className="hdr-right">
          <span className="hdr-meta">
            {resultCount !== undefined ? `${resultCount.toLocaleString()} results` : ''}
          </span>
          <button
            className="hdr-burger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <nav className="mobile-nav">
          <button
            className={view === 'home' || view === 'results' ? 'is-active' : ''}
            onClick={() => handleNav('home')}
          >
            Search
          </button>
          <button
            className={view === 'library' ? 'is-active' : ''}
            onClick={() => handleNav('library')}
          >
            Library
          </button>
          <button
            className={view === 'collections' ? 'is-active' : ''}
            onClick={() => handleNav('collections')}
          >
            Collections
          </button>
        </nav>
      )}
    </>
  );
}
