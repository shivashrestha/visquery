import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry } from '@/lib/fetch-retry';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export async function POST(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k') ?? '12';
  try {
    const form = await req.formData();
    const res = await fetchWithRetry(`${BACKEND_URL}/api/search/by-segment?k=${k}`, {
      method: 'POST',
      body: form,
    });
    const raw = await res.text();
    let data: unknown = null;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = { error: raw || `Backend error (${res.status})` }; }
    if (!res.ok) {
      if (res.status === 413) return NextResponse.json({ error: 'Segment crop too large — backend rejected payload.' }, { status: 413 });
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Segment search proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
