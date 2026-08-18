import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { applyStockMovement } from '@/services/inventory.service';
import { recordAudit } from '@/lib/audit';

const schema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
  branchId: z.string(),
});

/**
 * Spec section 47: cashiers REQUEST a return rather than deleting a sale.
 * A cashier can create the return record; whether it auto-approves or
 * needs manager sign-off is a business rule you can tighten by removing
 * "sales.refund" from CASHIER's permission set (it already isn't there).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('sales.view_own'); // any authenticated POS user can request
    const body = schema.parse(await req.json());

    const sale = await prisma.sale.findFirst({ where: { id: params.id, companyId: session.companyId } });
    if (!sale) throw new ApiError(404, 'Sale not found');

    const canAutoApprove = session.role === 'OWNER' || session.role === 'PRODUCT_MANAGER';

    const result = await prisma.$transaction(async (tx) => {
      const ret = await tx.saleReturn.create({
        data: {
          saleId: sale.id,
          productId: body.productId,
          quantity: body.quantity,
          reason: body.reason,
          status: canAutoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
          approvedBy: canAutoApprove ? session.userId : null,
        },
      });

      if (canAutoApprove) {
        await applyStockMovement(tx, {
          productId: body.productId,
          branchId: body.branchId,
          delta: body.quantity,
          movementType: 'SALE_RETURN',
          referenceType: 'SALE_RETURN',
          referenceId: ret.id,
        });
        await tx.sale.update({ where: { id: sale.id }, data: { status: 'PARTIALLY_RETURNED' } });
      }

      await recordAudit(tx, {
        companyId: session.companyId,
        userId: session.userId,
        action: canAutoApprove ? 'RETURN_APPROVED' : 'RETURN_REQUESTED',
        entity: 'SaleReturn',
        entityId: ret.id,
        newData: ret,
      });

      return ret;
    });

    return NextResponse.json({ return: result }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
