import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ sessionId: z.string(), closingCash: z.number().nonnegative() });

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('register.close');
    const body = schema.parse(await req.json());

    const regSession = await prisma.registerSession.findUnique({ where: { id: body.sessionId } });
    if (!regSession) throw new ApiError(404, 'Register session not found');
    if (regSession.closedAt) throw new ApiError(409, 'Register session already closed');
    if (regSession.cashierId !== session.userId && session.role !== 'OWNER') {
      throw new ApiError(403, 'Only the cashier who opened this session (or the owner) can close it');
    }

    // Expected cash = opening float + all CASH sale_payments recorded
    // during this session's window at this cashier.
    const cashSales = await prisma.salePayment.aggregate({
      where: {
        method: 'CASH',
        createdAt: { gte: regSession.openedAt },
        sale: { cashierId: regSession.cashierId },
      },
      _sum: { amount: true },
    });
    const expectedCash = Number(regSession.openingCash) + Number(cashSales._sum.amount ?? 0);
    const difference = body.closingCash - expectedCash;

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.registerSession.update({
        where: { id: body.sessionId },
        data: { closingCash: body.closingCash, expectedCash, difference, closedAt: new Date() },
      });
      await tx.cashRegister.update({ where: { id: regSession.registerId }, data: { status: 'CLOSED' } });
      await recordAudit(tx, {
        companyId: session.companyId,
        userId: session.userId,
        action: 'REGISTER_CLOSED',
        entity: 'RegisterSession',
        entityId: s.id,
        newData: s,
      });
      return s;
    });

    return NextResponse.json({ session: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
