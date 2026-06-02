import { NextRequest, NextResponse } from 'next/server';
import { verifyStudioToken, STUDIO_COOKIE } from '@/lib/studio-auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(STUDIO_COOKIE)?.value;
  const payload = verifyStudioToken(token);
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: {
      email: payload.sub,
      name: payload.name,
      role: payload.role,
      plan: payload.plan,
    },
  });
}
