'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LogOut, Search as SearchIcon, X } from 'lucide-react';
import ImageSearchModal from '../ImageSearchModal';
import type { StudioNavItem, StudioSection } from './StudioSidebar';

interface StudioTopbarProps {
  nav: StudioNavItem[];
  activeSection: StudioSection | null;
  onNavigate: (section: StudioSection) => void;
  onSearch: (q: string) => void;
  onImageSearch: (file: File) => void;
  user: { name: string; role: string; plan: string };
  onLogout: () => void;
}

/**
 * Architect's drawing-sheet "title block" as the workspace header.
 * Ruled cells, mono micro-labels (SHEET / VIEW / SEARCH / REV).
 * Replaces the old left sidebar so the left column is free for filters only.
 */
export default function StudioTopbar({
  nav, activeSection, onNavigate, onSearch, onImageSearch, user, onLogout,
}: StudioTopbarProps) {
  const initials = user.name
    .split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) { onNavigate('search'); return; }
    onSearch(term);
    setQ('');
  }

  return (
    <header className="vqs-tb">
      {/* Brand cell */}
      <button className="vqs-tb-cell vqs-tb-brand" onClick={() => onNavigate('overview')}>
        <span className="vqs-tb-tag">Sheet</span>
        <span className="vqs-tb-brand-row">
          <span className="vqs-tb-mark">VQ</span>
          <span className="vqs-tb-brand-txt">
            <span className="vqs-tb-title">Visquery</span>
            <span className="vqs-tb-plan"><span className="vqs-dot" /> {user.plan.toUpperCase()}</span>
          </span>
        </span>
      </button>

      {/* Nav cell */}
      <div className="vqs-tb-cell vqs-tb-nav-cell">
        <span className="vqs-tb-tag">View</span>
        <nav className="vqs-tb-nav">
          {nav.filter((n) => n.id !== 'account').map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                className={`vqs-tb-nav-item${active ? ' is-active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={15} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Search cell */}
      <form className="vqs-tb-cell vqs-tb-search-cell" onSubmit={submitSearch} role="search">
        <span className="vqs-tb-tag">Search</span>
        <div className="vqs-tb-search">
          <SearchIcon size={15} className="vqs-tb-search-ico" />
          <input
            className="vqs-tb-search-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search precedents…"
            aria-label="Search precedents"
          />
          {q && (
            <button type="button" className="vqs-tb-search-clear" onClick={() => setQ('')} aria-label="Clear">
              <X size={13} />
            </button>
          )}
          <span className="vqs-tb-search-div" aria-hidden />
          <button
            type="button"
            className="vqs-tb-img-btn"
            onClick={() => setImgOpen(true)}
            aria-label="Search by image"
            title="Search by uploading an image"
          >
            <ImagePlus size={15} />
          </button>
        </div>
      </form>

      {/* Account cell */}
      <div className="vqs-tb-cell vqs-tb-acct-cell" ref={menuRef}>
        <span className="vqs-tb-tag">Rev</span>
        <button
          className="vqs-tb-acct"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="vqs-tb-avatar">{initials}</span>
          <span className="vqs-tb-acct-txt">
            <span className="vqs-tb-acct-name">{user.name}</span>
            <span className="vqs-tb-acct-role">{user.role}</span>
          </span>
        </button>
        {menuOpen && (
          <div className="vqs-tb-menu" role="menu">
            <button
              className="vqs-tb-menu-item"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onNavigate('account'); }}
            >
              Account &amp; plan
            </button>
            <button
              className="vqs-tb-menu-item vqs-tb-menu-danger"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onLogout(); }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        )}
      </div>

      <ImageSearchModal
        open={imgOpen}
        onClose={() => setImgOpen(false)}
        onSearch={(file) => { setImgOpen(false); onImageSearch(file); }}
      />
    </header>
  );
}
