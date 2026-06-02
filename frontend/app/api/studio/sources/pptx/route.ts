import { NextRequest } from 'next/server';
import { forwardMultipart } from '@/lib/studio-proxy';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return forwardMultipart(req, '/api/studio/sources/pptx');
}
