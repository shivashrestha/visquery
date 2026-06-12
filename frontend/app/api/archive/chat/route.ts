import { NextRequest } from 'next/server';
import { forwardJson } from '@/lib/studio-proxy';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return forwardJson(req, '/api/archive/chat');
}
