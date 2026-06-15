import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 30;

function loadSystemPrompt(): string {
  const filePath = path.join(process.cwd(), 'data', 'assistant-context.md');
  return fs.readFileSync(filePath, 'utf-8');
}

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com';
  const apiKey = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_MODEL ?? 'gemma4:31b-cloud';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let systemPrompt: string;
  try {
    systemPrompt = loadSystemPrompt();
  } catch (err) {
    console.error('[assistant] failed to load context file', err);
    return NextResponse.json({ error: 'Assistant unavailable' }, { status: 503 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: false,
        options: { num_predict: 100, temperature: 0.3 },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[assistant] ollama error', res.status, text);
      return NextResponse.json({ error: 'LLM error' }, { status: 502 });
    }

    const data = await res.json();
    const reply: string = data?.message?.content ?? data?.response ?? '';
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[assistant] fetch failed', err);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
