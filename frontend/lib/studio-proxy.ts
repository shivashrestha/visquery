/**
 * Helpers for Studio API proxy routes — auth gate + transparent backend forwarding.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStudioToken, STUDIO_COOKIE, StudioJWTPayload } from './studio-auth';

export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:18001';

export function requireStudio(req: NextRequest): { user: StudioJWTPayload } | NextResponse {
  const token = req.cookies.get(STUDIO_COOKIE)?.value;
  const payload = verifyStudioToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Studio session required.' }, { status: 401 });
  }
  return { user: payload };
}

export async function forwardJson(req: NextRequest, backendPath: string): Promise<NextResponse> {
  const gate = requireStudio(req);
  if (gate instanceof NextResponse) return gate;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  try {
    const res = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Studio-Owner': gate.user.sub,
      },
      body: JSON.stringify(body),
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

export async function forwardMultipart(req: NextRequest, backendPath: string): Promise<NextResponse> {
  const gate = requireStudio(req);
  if (gate instanceof NextResponse) return gate;
  try {
    const form = await req.formData();
    const outboundForm = new FormData();
    for (const [k, v] of form.entries()) {
      outboundForm.append(k, v as Blob | string);
    }
    const res = await fetch(`${BACKEND_URL}${backendPath}`, {
      method: 'POST',
      headers: { 'X-Studio-Owner': gate.user.sub },
      body: outboundForm,
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
