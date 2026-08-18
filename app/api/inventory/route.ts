import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('inventory.view');
    const branchId = req.nextUrl.searchParams.get('branchId') ?? undefined;

    const inventory = await prisma.inventory.findMany({
      where: {
        product: { companyId: session.companyId },
        ...(branchId ? { branchId } : {}),
      },
      include: { product: { select: { id: true, name: true, sku: true, reorderLevel: true } }, branch: true },
      orderBy: { product: { name: 'asc' } },
    });

    return NextResponse.json({ inventory });
  } catch (err) {
    return handleApiError(err);
  }
}
