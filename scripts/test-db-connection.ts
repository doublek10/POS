/**
 * Verifies both Supabase connection strings independently, since they fail
 * in different ways:
 *   - DATABASE_URL (pooled, port 6543) — what the running app uses.
 *   - DIRECT_URL   (direct, port 5432) — what `prisma migrate` uses.
 *
 * Run with: npx tsx scripts/test-db-connection.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function testConnection(label: string, url: string | undefined) {
  if (!url) {
    console.log(`✗ ${label}: not set in .env`);
    return false;
  }

  const client = new PrismaClient({ datasources: { db: { url } } });
  const start = Date.now();
  try {
    await client.$queryRaw`SELECT 1`;
    console.log(`✓ ${label}: connected (${Date.now() - start}ms)`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`✗ ${label}: FAILED`);
    console.log(`  ${message.split('\n')[0]}`);
    return false;
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  console.log('Testing Supabase connections...\n');

  const pooledOk = await testConnection('DATABASE_URL (pooled, port 6543)', process.env.DATABASE_URL);
  const directOk = await testConnection('DIRECT_URL   (direct, port 5432)', process.env.DIRECT_URL);

  console.log('');
  if (pooledOk && directOk) {
    console.log('Both connections work. The app is good to go — run `npm run prisma:migrate` next if you haven\'t.');
  } else {
    console.log('At least one connection failed. Checklist:');
    console.log('  1. Password in the URL matches your Supabase project (Settings > Database > Reset password if unsure).');
    console.log('  2. Pooled URL uses port 6543 and includes ?pgbouncer=true.');
    console.log('  3. Direct URL uses port 5432 and does NOT include pgbouncer=true.');
    console.log('  4. Project ref in the host (e.g. aws-0-xx-xxxx.pooler.supabase.com) matches your actual project.');
    console.log('  5. If on IPv4-only network: Supabase direct connections are IPv6 by default — use the "Session pooler" connection string instead, or enable the IPv4 add-on.');
    process.exit(1);
  }
}

main();
