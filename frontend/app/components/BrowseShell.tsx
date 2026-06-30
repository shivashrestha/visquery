'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header, { type ViewName } from './Header';
import SiteFooter from './SiteFooter';
import LibraryView from './LibraryView';
import CollectionsView from './CollectionsView';
import { useFavorites } from '@/lib/useFavorites';
import type { SearchResultItem } from '@/lib/types';

/**
 * Standalone, crawlable shell for the /library and /collections routes.
 *
 * The home page (app/page.tsx) renders these same views as in-app `?view=`
 * states, which search engines can't index as distinct URLs. These routes give
 * each view a real, server-titled URL while reusing the existing view + detail
 * machinery: opening an item deep-links back into the SPA detail view, so we
 * don't duplicate DetailView / segment-search / related-image logic here.
 */
export default function BrowseShell({ view }: { view: 'library' | 'collections' }) {
  const router = useRouter();
  const { favItems, favs, toggleFav } = useFavorites();
  const [theme, setTheme] = useState<'monograph' | 'dark'>('monograph');

  useEffect(() => {
    try {
      if (localStorage.getItem('vq_theme') === 'dark') setTheme('dark');
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'monograph' : 'dark';
      try { localStorage.setItem('vq_theme', next); } catch {}
      return next;
    });
  }, []);

  const handleNav = useCallback((name: ViewName) => {
    if (name === 'library') router.push('/library');
    else if (name === 'collections') router.push('/collections');
    else if (name === 'studio') window.location.href = '/studio';
    else router.push('/'); // home / results / detail fall back to the SPA
  }, [router]);

  const handleOpen = useCallback((item: SearchResultItem) => {
    const params = new URLSearchParams({ view: 'detail', id: item.image_id, from: view });
    router.push(`/?${params.toString()}`);
  }, [router, view]);

  return (
    <div className="app" data-theme={theme}>
      <Header view={view} onNav={handleNav} theme={theme} onToggleTheme={toggleTheme} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'library' ? (
          <LibraryView onOpen={handleOpen} favs={favs} onFav={toggleFav} />
        ) : (
          <CollectionsView
            favItems={Object.values(favItems)}
            onOpen={handleOpen}
            favs={favs}
            onFav={toggleFav}
          />
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
