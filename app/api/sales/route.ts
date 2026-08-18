import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { createSale } from '@/services/sales.service';
import { prisma } from '@/lib/database/client';

const schema = z.object({
  branchId: z.string(),
  customerId: z.string().optional(),
  // Note: no price/total fields accepted from the client at all.
  // Only product IDs and quantities — see spec section 42.
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive(), discount: z.number().nonnegative().optional() })).min(1),
  cashPayments: z.array(z.object({ method: z.literal('CASH'), amount: z.number().positive() })).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('sales.create');
    const body = schema.parse(await req.json());

    const sale = await createSale({
      companyId: session.companyId,
      branchId: body.branchId,
      cashierId: session.userId, // from session, never from body
      customerId: body.customerId,
      items: body.items,
      cashPayments: body.cashPayments,
    });

    return NextResponse.json({ sale }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('sales.view_own');
    // Cashiers only ever see their own sales; owners/managers with
    // sales.view (granted via "*") can pass ?scope=company.
    const scope = req.nextUrl.searchParams.get('scope');
    const canViewAll = scope === 'company' && (session.role === 'OWNER');

    const sales = await prisma.sale.findMany({
      where: {
        companyId: session.companyId,
        ...(canViewAll ? {} : { cashierId: session.userId }),
      },
      include: { items: true, receipt: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ sales });
  } catch (err) {
    return handleApiError(err);
  }
}
