import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ registerId: z.string(), openingCash: z.number().nonnegative() });

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('register.open');
    const body = schema.parse(await req.json());

    const register = await prisma.cashRegister.findUnique({ where: { id: body.registerId } });
    if (!register) throw new ApiError(404, 'Register not found');
    if (register.status === 'OPEN') throw new ApiError(409, 'Register is already open');

    const session_ = await prisma.$transaction(async (tx) => {
      const s = await tx.registerSession.create({
        data: { registerId: body.registerId, cashierId: session.userId, openingCash: body.openingCash },
      });
      await tx.cashRegister.update({ where: { id: body.registerId }, data: { status: 'OPEN' } });
      await recordAudit(tx, {
        companyId: session.companyId,
        userId: session.userId,
        action: 'REGISTER_OPENED',
        entity: 'RegisterSession',
        entityId: s.id,
        newData: s,
      });
      return s;
    });

    return NextResponse.json({ session: session_ }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
