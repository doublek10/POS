import { Prisma } from '@prisma/client';

/**
 * Generates a sequential, human-readable receipt number per company,
 * e.g. "INV-000102". Uses a row count under the transaction's isolation
 * level rather than a separate counter table for simplicity — fine at
 * small-to-mid business volume; swap for a dedicated sequence table if
 * you need this to scale to very high concurrent throughput.
 */
export async function generateReceiptNumber(tx: Prisma.TransactionClient, companyId: string) {
  const count = await tx.receipt.count({
    where: { sale: { companyId } },
  });
  const next = count + 1;
  return `INV-${String(next).padStart(6, '0')}`;
}
