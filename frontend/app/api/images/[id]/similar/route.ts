import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const k = searchParams.get('k') ?? '8';
  try {
    const res = await fetch(`${BACKEND_URL}/api/images/${id}/similar?k=${k}`);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Similar proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
