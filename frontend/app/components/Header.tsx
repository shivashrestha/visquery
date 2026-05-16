'use client';

import { useState } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';
import VQLogo from './VQLogo';

export type ViewName = 'home' | 'results' | 'library' | 'collections' | 'detail';

interface HeaderProps {
  view: ViewName;
  onNav: (v: ViewName) => void;
  resultCount?: number;
  theme?: 'monograph' | 'dark';
  onToggleTheme?: () => void;
}

export default function Header({ view, onNav, resultCount, theme, onToggleTheme }: HeaderProps) {
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
            <VQLogo variant="header" />
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
          {onToggleTheme && (
            <button
              className="theme-toggle"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark'
                ? <Sun size={15} />
                : <Moon size={15} />
              }
            </button>
          )}
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
