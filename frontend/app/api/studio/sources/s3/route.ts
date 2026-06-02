import { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/studio-proxy';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return forwardJson(req, '/api/studio/sources/s3');
}
