import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requirePermission('sales.view_own');
    const sale = await prisma.sale.findFirst({
      where: { id: params.id, companyId: session.companyId },
      include: {
        items: true,
        receipt: true,
        payments: true,
        paymentTransactions: true,
        cashier: { select: { name: true } },
        company: { select: { name: true, address: true, phone: true } },
      },
    });
    if (!sale) throw new ApiError(404, 'Sale not found');
    if (session.role === 'CASHIER' && sale.cashierId !== session.userId) {
      throw new ApiError(403, 'Cashiers can only view their own sales');
    }
    return NextResponse.json({ sale });
  } catch (err) {
    return handleApiError(err);
  }
}
