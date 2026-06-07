import { NextRequest, NextResponse } from 'next/server';
import { requireStudio, BACKEND_URL } from '@/lib/studio-proxy';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = requireStudio(req);
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = req.nextUrl;
  const params = new URLSearchParams({
    skip:  searchParams.get('skip')  ?? '0',
    limit: searchParams.get('limit') ?? '40',
    sort:  searchParams.get('sort')  ?? 'created_at_desc',
  });

  try {
    const res = await fetch(`${BACKEND_URL}/api/images?${params.toString()}`, {
      headers: { 'X-Studio-Owner': gate.user.sub },
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
