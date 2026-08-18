import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/database/client';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email or password format' }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email },
    include: { role: true },
  });

  // Deliberately identical error for "no such user" and "wrong password"
  // so the endpoint doesn't leak which emails are registered.
  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    companyId: user.companyId,
    role: user.role.name,
    name: user.name,
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role.name },
  });
}
