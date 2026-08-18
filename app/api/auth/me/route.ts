import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: { id: session.userId, name: session.name, role: session.role },
  });
}
