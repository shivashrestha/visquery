import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, requireStudio } from '@/lib/studio-proxy';

export const runtime = 'nodejs';

// Studio-gated: anonymous tryout users get 401 and the archive UI never renders.
export async function GET(req: NextRequest) {
  const gate = requireStudio(req);
  if (gate instanceof NextResponse) return gate;
  try {
    const res = await fetch(`${BACKEND_URL}/api/archive/status`, {
      headers: { 'X-Studio-Owner': gate.user.sub },
      cache: 'no-store',
    });
    const raw = await res.text();
    let data: unknown = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { error: raw }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Backend unreachable' },
      { status: 502 },
    );
  }
}
