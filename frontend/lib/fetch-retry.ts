const RETRY_DELAYS_MS = [3_000, 6_000, 12_000];
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/**
 * Wraps fetch with automatic retry on gateway errors (502/503/504).
 * Designed for Next.js proxy routes calling a backend that may be warming up.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: Error | null = null;
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((r) =>
        setTimeout(r, RETRY_DELAYS_MS[attempt - 1] ?? 12_000),
      );
    }
    try {
      const res = await fetch(url, init);
      if (res.ok || !RETRYABLE_STATUSES.has(res.status)) return res;
      lastRes = res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastRes) return lastRes;
  throw lastErr ?? new Error('Request failed after retries');
}
