import { prisma } from '@/lib/database/client';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/lib/permissions/guard';

export interface CreateProductInput {
  companyId: string;
  actorUserId: string;
  categoryId?: string;
  brandId?: string;
  name: string;
  description?: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  taxRate?: number;
  reorderLevel?: number;
  unit?: string;
  imageUrl?: string;
  barcodes?: string[];
}

export async function createProduct(input: CreateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { companyId_sku: { companyId: input.companyId, sku: input.sku } },
  });
  if (existing) {
    throw new ApiError(409, `A product with SKU "${input.sku}" already exists`);
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        companyId: input.companyId,
        categoryId: input.categoryId,
        brandId: input.brandId,
        name: input.name,
        description: input.description,
        sku: input.sku,
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        taxRate: input.taxRate ?? 0,
        reorderLevel: input.reorderLevel ?? 0,
        unit: input.unit ?? 'pcs',
        imageUrl: input.imageUrl,
        barcodes: input.barcodes?.length
          ? { create: input.barcodes.map((barcode) => ({ barcode })) }
          : undefined,
      },
      include: { barcodes: true },
    });

    await recordAudit(tx, {
      companyId: input.companyId,
      userId: input.actorUserId,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: created.id,
      newData: created,
    });

    return created;
  });

  return product;
}

export interface UpdateProductInput {
  companyId: string;
  actorUserId: string;
  productId: string;
  data: Partial<{
    name: string;
    description: string;
    categoryId: string;
    brandId: string;
    costPrice: number;
    sellingPrice: number;
    taxRate: number;
    reorderLevel: number;
    unit: string;
    imageUrl: string;
    isActive: boolean;
  }>;
}

export async function updateProduct(input: UpdateProductInput) {
  const before = await prisma.product.findFirst({
    where: { id: input.productId, companyId: input.companyId },
  });
  if (!before) throw new ApiError(404, 'Product not found');

  const priceChanged =
    input.data.sellingPrice !== undefined &&
    Number(before.sellingPrice) !== input.data.sellingPrice;

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: input.productId },
      data: input.data,
    });

    await recordAudit(tx, {
      companyId: input.companyId,
      userId: input.actorUserId,
      action: priceChanged ? 'PRODUCT_PRICE_CHANGED' : 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: product.id,
      oldData: before,
      newData: product,
    });

    return product;
  });

  return updated;
}

/** Deactivate rather than hard-delete — sale history references products by id. */
export async function deactivateProduct(companyId: string, actorUserId: string, productId: string) {
  const before = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!before) throw new ApiError(404, 'Product not found');

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    await recordAudit(tx, {
      companyId,
      userId: actorUserId,
      action: 'PRODUCT_DEACTIVATED',
      entity: 'Product',
      entityId: productId,
      oldData: before,
      newData: product,
    });
    return product;
  });
}

export async function listProducts(companyId: string, opts: { search?: string; branchId?: string } = {}) {
  return prisma.product.findMany({
    where: {
      companyId,
      isActive: true,
      ...(opts.search
        ? {
            OR: [
              { name: { contains: opts.search, mode: 'insensitive' } },
              { sku: { contains: opts.search, mode: 'insensitive' } },
              { barcodes: { some: { barcode: opts.search } } },
            ],
          }
        : {}),
    },
    include: {
      barcodes: true,
      category: true,
      brand: true,
      inventory: opts.branchId ? { where: { branchId: opts.branchId } } : true,
    },
    orderBy: { name: 'asc' },
    take: 200,
  });
}

/** Product lookup by exact barcode — the hot path used when a scanner fires. */
export async function findProductByBarcode(companyId: string, barcode: string, branchId: string) {
  const match = await prisma.productBarcode.findUnique({
    where: { barcode },
    include: {
      product: {
        include: { inventory: { where: { branchId } } },
      },
    },
  });
  if (!match || match.product.companyId !== companyId || !match.product.isActive) return null;
  return match.product;
}
