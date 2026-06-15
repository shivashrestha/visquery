import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry } from '@/lib/fetch-retry';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export async function POST(req: NextRequest) {
  const model = req.nextUrl.searchParams.get('model') ?? 'fastsam';
  try {
    const form = await req.formData();
    const res = await fetchWithRetry(
      `${BACKEND_URL}/api/images/segment-upload?model=${model}`,
      { method: 'POST', body: form },
    );
    const raw = await res.text();
    let data: unknown = null;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = { error: raw || `Backend error (${res.status})` }; }
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Segment upload proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
