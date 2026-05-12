import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const params = new URLSearchParams();
    if (searchParams.get('skip')) params.set('skip', searchParams.get('skip')!);
    if (searchParams.get('limit')) params.set('limit', searchParams.get('limit')!);
    if (searchParams.get('sort')) params.set('sort', searchParams.get('sort')!);

    const res = await fetch(`${BACKEND_URL}/api/images?${params.toString()}`, {
      cache: 'no-store',
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
    const message = err instanceof Error ? err.message : 'Images proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
