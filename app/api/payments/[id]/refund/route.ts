import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { getProvider } from '@/services/payment.service';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ amount: z.number().positive(), reason: z.string().optional() });

/**
 * Only OWNER can approve/process refunds per spec section 2
 * ("Process/approve refunds" is listed under the owner's exclusive
 * capabilities, and is absent from both PRODUCT_MANAGER and CASHIER's
 * permission sets).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('payments.refund');
    const body = schema.parse(await req.json());

    const txn = await prisma.paymentTransaction.findFirst({
      where: { id: params.id, companyId: session.companyId },
    });
    if (!txn) throw new ApiError(404, 'Payment transaction not found');
    if (txn.status !== 'COMPLETED' && txn.status !== 'PARTIALLY_REFUNDED') {
      throw new ApiError(409, `Cannot refund a payment in status ${txn.status}`);
    }
    if (body.amount > Number(txn.amount)) {
      throw new ApiError(400, 'Refund amount cannot exceed the original payment amount');
    }

    // The ORIGINAL payment record is never deleted or overwritten — spec
    // section 48. A refund is always a new, separate ledger row.
    const result = await prisma.$transaction(async (tx) => {
      let refundReference = `MANUAL-${Date.now()}`;
      if (txn.provider !== 'CASH' && txn.providerReference) {
        const provider = getProvider(txn.provider as any);
        const providerResult = await provider.refundPayment(txn.providerReference, body.amount);
        refundReference = providerResult.refundReference;
      }

      const refund = await tx.paymentRefund.create({
        data: { paymentTransactionId: txn.id, amount: body.amount, reason: body.reason },
      });

      const totalRefunded =
        (await tx.paymentRefund.aggregate({
          where: { paymentTransactionId: txn.id },
          _sum: { amount: true },
        }))._sum.amount ?? 0;

      await tx.paymentTransaction.update({
        where: { id: txn.id },
        data: {
          status: Number(totalRefunded) >= Number(txn.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });

      await recordAudit(tx, {
        companyId: session.companyId,
        userId: session.userId,
        action: 'REFUND_CREATED',
        entity: 'PaymentTransaction',
        entityId: txn.id,
        newData: { amount: body.amount, reason: body.reason, refundReference },
      });

      return refund;
    });

    return NextResponse.json({ refund: result }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
