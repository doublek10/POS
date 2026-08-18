import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { createProduct, listProducts } from '@/services/product.service';

const createSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unit: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  barcodes: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('products.view');
    const search = req.nextUrl.searchParams.get('search') ?? undefined;
    const branchId = req.nextUrl.searchParams.get('branchId') ?? undefined;
    const products = await listProducts(session.companyId, { search, branchId });
    return NextResponse.json({ products });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only OWNER (via *) or PRODUCT_MANAGER (via products.*) reach here.
    // A CASHIER's token will fail roleHasPermission and get a 403 —
    // regardless of what the client sent or which UI button was clicked.
    const session = await requirePermission('products.create');
    const body = createSchema.parse(await req.json());

    const product = await createProduct({
      companyId: session.companyId,
      actorUserId: session.userId,
      ...body,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
