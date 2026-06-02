import { NextResponse } from 'next/server';
import { STUDIO_COOKIE } from '@/lib/studio-auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(STUDIO_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
