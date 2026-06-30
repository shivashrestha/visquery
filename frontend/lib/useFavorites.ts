'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SearchResultItem } from './types';
import { imageUrlToDataUrl } from './api';

const STORAGE_KEY = 'visquery_favs';

/**
 * Saved-image state backed by localStorage. Mirrors the favorites logic in the
 * home SPA (app/page.tsx) so the standalone /library and /collections routes
 * share the same `visquery_favs` store and behave identically.
 */
export function useFavorites() {
  const [favItems, setFavItems] = useState<Record<string, SearchResultItem>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed: Record<string, SearchResultItem> = stored ? JSON.parse(stored) : {};
      let changed = false;
      for (const [k, v] of Object.entries(parsed)) {
        if (v.image_url?.startsWith('blob:')) { delete parsed[k]; changed = true; }
      }
      if (changed) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } catch {} }
      return parsed;
    } catch { return {}; }
  });

  const favs = useMemo(() => {
    const out: Record<string, boolean> = {};
    Object.keys(favItems).forEach((k) => { out[k] = true; });
    return out;
  }, [favItems]);

  const toggleFav = useCallback((item: SearchResultItem) => {
    const persist = (next: Record<string, SearchResultItem>) => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    };
    setFavItems((prev) => {
      if (prev[item.image_id]) {
        const next = { ...prev };
        delete next[item.image_id];
        persist(next);
        return next;
      }
      if (item.image_url?.startsWith('blob:')) {
        imageUrlToDataUrl(item.image_url).then((dataUrl) => {
          setFavItems((cur) => {
            if (!cur[item.image_id]) return cur;
            const next = { ...cur, [item.image_id]: { ...item, image_url: dataUrl ?? item.image_url } };
            persist(next);
            return next;
          });
        });
      }
      const next = { ...prev, [item.image_id]: item };
      persist(next);
      return next;
    });
  }, []);

  return { favItems, favs, toggleFav };
}
