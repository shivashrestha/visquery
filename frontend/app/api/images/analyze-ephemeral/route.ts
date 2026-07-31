import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry } from '@/lib/fetch-retry';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

// VLM artifact extraction routinely takes 45-150s (large cloud vision model) — default
// Vercel function limits (10-60s) would kill this before the backend ever responds.
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const res = await fetchWithRetry(`${BACKEND_URL}/api/images/analyze-ephemeral`, {
      method: 'POST',
      body: formData,
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = { error: raw || `Backend error (${res.status})` };
    }
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analyze proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
