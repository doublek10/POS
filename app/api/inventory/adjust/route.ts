import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { adjustStock } from '@/services/inventory.service';

const schema = z.object({
  productId: z.string(),
  branchId: z.string(),
  delta: z.number().int().refine((v) => v !== 0, 'delta must not be zero'),
  reason: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    // Cashiers hold no "inventory.adjust" permission (spec section 4:
    // "should NOT be able to ... modify inventory directly").
    const session = await requirePermission('inventory.adjust');
    const body = schema.parse(await req.json());
    const result = await adjustStock({
      companyId: session.companyId,
      actorUserId: session.userId,
      ...body,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
