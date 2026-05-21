import { NextRequest, NextResponse } from 'next/server';

const CLIENTS = [
  {
    email: process.env.STUDIO_CLIENT_1_EMAIL,
    password: process.env.STUDIO_CLIENT_1_PASSWORD,
    name: process.env.STUDIO_CLIENT_1_NAME ?? 'Client 1',
    role: 'architect',
    plan: 'studio',
  },
  {
    email: process.env.STUDIO_CLIENT_2_EMAIL,
    password: process.env.STUDIO_CLIENT_2_PASSWORD,
    name: process.env.STUDIO_CLIENT_2_NAME ?? 'Client 2',
    role: 'designer',
    plan: 'studio',
  },
];

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 });
  }

  const match = CLIENTS.find(
    (c) => c.email === email.trim().toLowerCase() && c.password === password,
  );

  if (!match) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: { name: match.name, email: match.email, role: match.role, plan: match.plan },
  });
}
