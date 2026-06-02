/**
 * Studio JWT issue / verify utilities + client config.
 *
 * - Uses Node `crypto` HMAC-SHA256 (zero external deps).
 * - Cookie: HttpOnly, SameSite=Lax, Secure in prod.
 * - Token payload: { sub: email, name, role, plan, iat, exp }.
 */
import crypto from 'crypto';

export interface StudioJWTPayload {
  sub: string;          // email
  name: string;
  role: string;
  plan: string;
  iat: number;
  exp: number;
}

export const STUDIO_COOKIE = 'vq_studio_token';
export const STUDIO_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s = process.env.STUDIO_JWT_SECRET;
  if (!s || s.length < 16) {
    // Dev fallback — warn loudly. Deploys must set STUDIO_JWT_SECRET.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STUDIO_JWT_SECRET must be set in production');
    }
    return 'dev-only-insecure-secret-please-override-in-env-local-1234567890';
  }
  return s;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(headerB64: string, payloadB64: string): string {
  return b64url(
    crypto.createHmac('sha256', getSecret()).update(`${headerB64}.${payloadB64}`).digest(),
  );
}

export function issueStudioToken(payload: Omit<StudioJWTPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full: StudioJWTPayload = { ...payload, iat: now, exp: now + STUDIO_TOKEN_TTL_SECONDS };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(full));
  return `${header}.${body}.${sign(header, body)}`;
}

export function verifyStudioToken(token: string | undefined | null): StudioJWTPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = sign(h, p);
  // timing-safe equality
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(s);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload: StudioJWTPayload;
  try {
    payload = JSON.parse(b64urlDecode(p).toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  return payload;
}

export function studioCookieOptions() {
  return {
    name: STUDIO_COOKIE,
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: STUDIO_TOKEN_TTL_SECONDS,
  };
}
