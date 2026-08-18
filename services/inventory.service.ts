import { Prisma, MovementType } from '@prisma/client';
import { prisma } from '@/lib/database/client';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/lib/permissions/guard';

type Tx = Prisma.TransactionClient;

/**
 * Applies a signed quantity delta to a product's stock at a branch and
 * writes the corresponding ledger row, inside an existing transaction.
 *
 * Section 20/60 of the spec: `products.stock_quantity` must never be the
 * sole source of truth, and concurrent sales of the last unit must not
 * be able to drive stock negative. We satisfy both by:
 *   1. Using `SELECT ... FOR UPDATE` (via Prisma's row lock idiom below)
 *      to serialize concurrent writers on the same inventory row.
 *   2. Writing an immutable inventory_movements row for every change.
 *
 * Throws ApiError(409) if the resulting balance would go negative and
 * `allowNegative` is false (the default) — callers running this inside
 * a sale should let that exception roll back the whole transaction.
 */
export async function applyStockMovement(
  tx: Tx,
  params: {
    productId: string;
    branchId: string;
    delta: number; // positive = stock in, negative = stock out
    movementType: MovementType;
    referenceType?: string;
    referenceId?: string;
    allowNegative?: boolean;
  }
) {
  // Row lock: SELECT ... FOR UPDATE via $queryRaw, since Prisma has no
  // first-class lock API. This serializes two concurrent sales of the
  // same product/branch so the read-then-write below can't race.
  const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>(
    Prisma.sql`
      SELECT id, quantity FROM inventory
      WHERE "productId" = ${params.productId} AND "branchId" = ${params.branchId}
      FOR UPDATE
    `
  );

  let inventoryId: string;
  let currentQty: number;

  if (locked.length === 0) {
    // No inventory row yet for this product/branch — create it at zero
    // before applying the movement, so opening stock and first purchase
    // both work without a separate provisioning step.
    const created = await tx.inventory.create({
      data: { productId: params.productId, branchId: params.branchId, quantity: 0 },
    });
    inventoryId = created.id;
    currentQty = 0;
  } else {
    inventoryId = locked[0].id;
    currentQty = locked[0].quantity;
  }

  const balanceAfter = currentQty + params.delta;

  if (balanceAfter < 0 && !params.allowNegative) {
    throw new ApiError(
      409,
      `Insufficient stock: have ${currentQty}, requested ${-params.delta}`
    );
  }

  await tx.inventory.update({
    where: { id: inventoryId },
    data: { quantity: balanceAfter },
  });

  await tx.inventoryMovement.create({
    data: {
      productId: params.productId,
      branchId: params.branchId,
      movementType: params.movementType,
      quantity: params.delta,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      balanceAfter,
    },
  });

  return { balanceAfter };
}

export async function adjustStock(input: {
  companyId: string;
  actorUserId: string;
  productId: string;
  branchId: string;
  delta: number;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, companyId: input.companyId },
    });
    if (!product) throw new ApiError(404, 'Product not found');

    const result = await applyStockMovement(tx, {
      productId: input.productId,
      branchId: input.branchId,
      delta: input.delta,
      movementType: 'ADJUSTMENT',
      referenceType: 'MANUAL_ADJUSTMENT',
    });

    await recordAudit(tx, {
      companyId: input.companyId,
      userId: input.actorUserId,
      action: 'STOCK_ADJUSTED',
      entity: 'Product',
      entityId: input.productId,
      newData: { delta: input.delta, reason: input.reason, balanceAfter: result.balanceAfter },
    });

    return result;
  });
}

export async function receiveStock(input: {
  companyId: string;
  actorUserId: string;
  supplierId: string;
  branchId: string;
  items: { productId: string; quantity: number; unitCost: number }[];
}) {
  if (input.items.length === 0) throw new ApiError(400, 'Purchase must include at least one item');

  return prisma.$transaction(async (tx) => {
    const total = input.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

    const purchase = await tx.purchase.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        status: 'RECEIVED',
        total,
        receivedAt: new Date(),
        items: { create: input.items },
      },
      include: { items: true },
    });

    for (const item of input.items) {
      await applyStockMovement(tx, {
        productId: item.productId,
        branchId: input.branchId,
        delta: item.quantity,
        movementType: 'PURCHASE',
        referenceType: 'PURCHASE',
        referenceId: purchase.id,
      });
    }

    await recordAudit(tx, {
      companyId: input.companyId,
      userId: input.actorUserId,
      action: 'STOCK_RECEIVED',
      entity: 'Purchase',
      entityId: purchase.id,
      newData: purchase,
    });

    return purchase;
  });
}

export async function lowStockProducts(companyId: string, branchId?: string) {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; sku: string; reorderLevel: number; quantity: number }[]
  >(Prisma.sql`
    SELECT p.id, p.name, p.sku, p."reorderLevel", COALESCE(SUM(i.quantity), 0)::int AS quantity
    FROM products p
    LEFT JOIN inventory i ON i."productId" = p.id
      ${branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty}
    WHERE p."companyId" = ${companyId} AND p."isActive" = true
    GROUP BY p.id
    HAVING COALESCE(SUM(i.quantity), 0) <= p."reorderLevel"
    ORDER BY quantity ASC
  `);
  return rows;
}
