import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { updateProduct, deactivateProduct } from '@/services/product.service';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  costPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unit: z.string().optional(),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // A cashier session simply does not carry "products.update" — see
    // ROLE_PERMISSIONS. There is no code path here that a hidden or
    // forged frontend request could use to bypass this.
    const session = await requirePermission('products.update');
    const body = updateSchema.parse(await req.json());
    const product = await updateProduct({
      companyId: session.companyId,
      actorUserId: session.userId,
      productId: params.id,
      data: body,
    });
    return NextResponse.json({ product });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Spec section 5's exact example: DELETE /api/products/123 called
    // by a cashier must be rejected here even if the button was hidden
    // client-side. Cashiers hold no "products.delete" permission.
    const session = await requirePermission('products.delete');
    const product = await deactivateProduct(session.companyId, session.userId, params.id);
    return NextResponse.json({ product });
  } catch (err) {
    return handleApiError(err);
  }
}
