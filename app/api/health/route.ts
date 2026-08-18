import { NextResponse } from 'next/server';
import { prisma } from '@/lib/database/client';

// Lightweight connectivity check for Supabase Postgres.
// Hits the pooled connection (DATABASE_URL) the same way the rest of the
// app does, so a green result here means the app's normal queries will work.
//
// GET /api/health -> { ok: true, latencyMs, database: "connected" }
export async function GET() {
  const start = Date.now();
  try {
    // SELECT 1 is enough to prove the pooled connection + auth + network path
    // all work, without depending on any table existing yet.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: 'connected',
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Common Supabase failure signatures, surfaced so they're not just a
    // generic 500 in the logs.
    let hint: string | undefined;
    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      hint = 'DNS lookup failed — check the host in DATABASE_URL matches your Supabase project ref.';
    } else if (message.includes('password authentication failed')) {
      hint = 'Wrong database password in DATABASE_URL/DIRECT_URL.';
    } else if (message.includes('prepared statement') || message.includes('does not exist')) {
      hint = 'Likely a PgBouncer prepared-statement conflict — confirm DATABASE_URL has ?pgbouncer=true.';
    } else if (message.includes('too many connections') || message.includes('remaining connection slots')) {
      hint = 'Connection pool exhausted — verify DATABASE_URL points at the pooler (port 6543), not the direct port (5432).';
    } else if (message.includes('self signed certificate') || message.includes('SSL')) {
      hint = 'SSL/TLS negotiation failed — try appending ?sslmode=require to the connection string.';
    }

    return NextResponse.json(
      {
        ok: false,
        database: 'disconnected',
        error: message,
        hint,
        latencyMs: Date.now() - start,
      },
      { status: 503 }
    );
  }
}
