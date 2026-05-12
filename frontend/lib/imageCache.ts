/**
 * Module-level image URL cache — survives React component unmounts within
 * the same JS session. sessionStorage warms the Set on page reload so
 * previously loaded images skip the shimmer on navigation back.
 */
const _loaded = new Set<string>();
const SESSION_KEY = 'vq_img_cache';
const MAX_ENTRIES = 500;

function init() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      (JSON.parse(raw) as string[]).forEach((u) => _loaded.add(u));
    }
  } catch {}
}

if (typeof window !== 'undefined') init();

export function isLoaded(url: string): boolean {
  return _loaded.has(url);
}

export function markLoaded(url: string): void {
  if (_loaded.has(url)) return;
  _loaded.add(url);
  try {
    const arr = Array.from(_loaded).slice(-MAX_ENTRIES);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(arr));
  } catch {}
}
