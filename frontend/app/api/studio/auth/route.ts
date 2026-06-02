import { NextRequest, NextResponse } from 'next/server';
import { findAndVerify, getClients } from '@/lib/studio-clients';
import { issueStudioToken, studioCookieOptions } from '@/lib/studio-auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 });
  }

  if (getClients().length === 0) {
    return NextResponse.json(
      {
        error:
          'Studio auth not configured. Set STUDIO_CLIENT_1_EMAIL / STUDIO_CLIENT_1_PASSWORD in .env.local and restart the dev server.',
      },
      { status: 503 },
    );
  }

  const client = await findAndVerify(email, password);
  if (!client) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = issueStudioToken({
    sub: client.email,
    name: client.name,
    role: client.role,
    plan: client.plan,
  });

  const res = NextResponse.json({
    success: true,
    user: { name: client.name, email: client.email, role: client.role, plan: client.plan },
  });
  const opts = studioCookieOptions();
  res.cookies.set(opts.name, token, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    maxAge: opts.maxAge,
  });
  return res;
}
