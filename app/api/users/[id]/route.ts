import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { recordAudit } from '@/lib/audit';

const schema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']).optional() });

/** Owner-only: disable/remove an employee, or edit their status. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('users.update');
    const body = schema.parse(await req.json());

    const before = await prisma.user.findFirst({ where: { id: params.id, companyId: session.companyId } });
    if (!before) throw new ApiError(404, 'User not found');

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: params.id }, data: body });
      await recordAudit(tx, {
        companyId: session.companyId,
        userId: session.userId,
        action: 'USER_ROLE_CHANGED',
        entity: 'User',
        entityId: u.id,
        oldData: { status: before.status },
        newData: { status: u.status },
      });
      return u;
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
