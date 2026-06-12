import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, requireStudio } from '@/lib/studio-proxy';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = requireStudio(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/api/archive/sources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
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
