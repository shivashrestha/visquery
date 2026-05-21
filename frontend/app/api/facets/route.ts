import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/facets`, { cache: 'no-store' });
    const raw = await res.text();
    let data: unknown = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = {}; }
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Facets proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
