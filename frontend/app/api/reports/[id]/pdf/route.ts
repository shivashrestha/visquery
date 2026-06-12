import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/api/reports/${id}/pdf`);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text || `Backend error (${res.status})` },
        { status: res.status },
      );
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          res.headers.get('Content-Disposition') ??
          `attachment; filename="precedent-report-${id}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Report PDF proxy error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
