'use client';

import type { LucideIcon } from 'lucide-react';
import { LogOut } from 'lucide-react';

export type StudioSection = 'overview' | 'search' | 'library' | 'sources' | 'account';

export interface StudioNavItem {
  id: StudioSection;
  label: string;
  icon: LucideIcon;
}

interface StudioSidebarProps {
  nav: StudioNavItem[];
  activeSection: StudioSection | null;
  onNavigate: (section: StudioSection) => void;
  user: { name: string; role: string; plan: string };
  onLogout: () => void;
}

export default function StudioSidebar({
  nav, activeSection, onNavigate, user, onLogout,
}: StudioSidebarProps) {
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="vqs-sidebar">
      <button className="vqs-side-brand" onClick={() => onNavigate('overview')} aria-label="Go to overview">
        <span className="vqs-side-mark">VQ</span>
        <span className="vqs-side-brand-txt">
          <span className="vqs-side-title">Visquery</span>
          <span className="vqs-side-sub">
            <span className="vqs-dot" /> {user.plan.toUpperCase()} · Active
          </span>
        </span>
      </button>

      <p className="vqs-nav-section-label">Workspace</p>
      <nav className="vqs-nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              className={`vqs-nav-item${active ? ' is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <span className="vqs-nav-ico"><Icon size={17} /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="vqs-side-quote">
        &ldquo;Every precedent, one search away.&rdquo;
      </div>

      <div className="vqs-side-foot">
        <button className="vqs-side-user" onClick={() => onNavigate('account')}>
          <span className="vqs-side-avatar">{initials}</span>
          <span className="vqs-side-user-txt">
            <span className="vqs-side-user-name">{user.name}</span>
            <span className="vqs-side-user-role">{user.role}</span>
          </span>
        </button>
        <button className="vqs-signout" onClick={onLogout}>
          <LogOut size={14} /><span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
