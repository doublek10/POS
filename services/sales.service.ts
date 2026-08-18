import { Prisma, PaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/database/client';
import { applyStockMovement } from '@/services/inventory.service';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/lib/permissions/guard';
import { generateReceiptNumber } from '@/lib/receipts/number';

export interface CartLineInput {
  productId: string;
  quantity: number;
  /** Optional per-line discount amount in currency units, subject to permission checks upstream. */
  discount?: number;
}

export interface CashPaymentInput {
  method: 'CASH';
  amount: number;
}

export interface CreateSaleInput {
  companyId: string;
  branchId: string;
  cashierId: string; // ALWAYS taken from the session, never the request body — see spec section 17
  customerId?: string;
  items: CartLineInput[];
  /** Cash payments are settled immediately at sale time. Digital payments (M-Pesa/PesaPal/Card)
   *  are created as a separate PENDING PaymentTransaction by the payments/* routes and the sale
   *  is only completed once their webhook confirms payment — see completeSaleFromPayment(). */
  cashPayments?: CashPaymentInput[];
}

/**
 * Recalculates a cart's pricing entirely from server-side product data.
 * Section 42 of the spec: "NEVER TRUST THE FRONTEND" — the browser only
 * ever sends product IDs and quantities, never prices or totals.
 */
async function priceCart(
  tx: Prisma.TransactionClient,
  companyId: string,
  items: CartLineInput[]
) {
  if (items.length === 0) throw new ApiError(400, 'Cart is empty');

  const productIds = items.map((i) => i.productId);
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, companyId, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  const lines = items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw new ApiError(400, `Product ${item.productId} not found or inactive`);
    if (item.quantity <= 0) throw new ApiError(400, 'Quantity must be positive');

    const unitPrice = Number(product.sellingPrice);
    const lineDiscount = Math.min(item.discount ?? 0, unitPrice * item.quantity);
    const lineSubtotal = unitPrice * item.quantity - lineDiscount;
    const lineTax = lineSubtotal * (Number(product.taxRate) / 100);
    const lineTotal = lineSubtotal + lineTax;

    subtotal += unitPrice * item.quantity;
    discount += lineDiscount;
    tax += lineTax;

    return {
      product,
      quantity: item.quantity,
      unitPrice,
      discount: lineDiscount,
      tax: lineTax,
      lineTotal,
    };
  });

  const total = subtotal - discount + tax;
  return { lines, subtotal, discount, tax, total };
}

/**
 * Creates a sale. If `cashPayments` fully covers the total, the sale is
 * completed synchronously (the common cash-register case). Otherwise the
 * sale is left PENDING for a digital payment to complete it — see the
 * payments/* and webhooks/* routes.
 *
 * Implements the transaction from spec section 22/59: stock is checked
 * and decremented, the sale/items/payments/receipt/audit rows are all
 * written atomically, and any failure rolls the whole thing back so we
 * can never end up with "money received but stock not reduced" or vice
 * versa.
 */
export async function createSale(input: CreateSaleInput) {
  return prisma.$transaction(
    async (tx) => {
      const { lines, subtotal, discount, tax, total } = await priceCart(
        tx,
        input.companyId,
        input.items
      );

      const cashTotal = (input.cashPayments ?? []).reduce((s, p) => s + p.amount, 0);
      const isFullyPaidByCash = cashTotal >= total - 0.005; // tolerate float rounding

      const sale = await tx.sale.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          cashierId: input.cashierId,
          customerId: input.customerId,
          subtotal,
          discount,
          tax,
          total,
          status: isFullyPaidByCash ? 'COMPLETED' : 'PENDING',
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              productName: l.product.name, // snapshot — spec section 44
              sku: l.product.sku,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              tax: l.tax,
              lineTotal: l.lineTotal,
              costPrice: l.product.costPrice,
            })),
          },
        },
        include: { items: true },
      });

      if (!isFullyPaidByCash) {
        // Digital payment path: stock is NOT reduced yet. It will be
        // reduced by completeSaleFromPayment() once the provider
        // webhook confirms the payment, so we never decrement stock
        // for a sale that might still fail or be abandoned.
        return sale;
      }

      // Cash path: stock reduces immediately since cash is confirmed
      // at the point of sale.
      for (const line of lines) {
        await applyStockMovement(tx, {
          productId: line.product.id,
          branchId: input.branchId,
          delta: -line.quantity,
          movementType: 'SALE',
          referenceType: 'SALE',
          referenceId: sale.id,
        });
      }

      for (const payment of input.cashPayments ?? []) {
        await tx.salePayment.create({
          data: { saleId: sale.id, method: 'CASH', amount: payment.amount },
        });
      }

      const receipt = await tx.receipt.create({
        data: {
          saleId: sale.id,
          receiptNumber: await generateReceiptNumber(tx, input.companyId),
          cashierId: input.cashierId,
          paymentMethod: 'CASH',
        },
      });

      await recordAudit(tx, {
        companyId: input.companyId,
        userId: input.cashierId,
        action: 'SALE_CREATED',
        entity: 'Sale',
        entityId: sale.id,
        newData: { total, itemCount: lines.length, receiptNumber: receipt.receiptNumber },
      });

      return { ...sale, receipt };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

/**
 * Completes a PENDING sale once a digital payment (M-Pesa/PesaPal/Card)
 * has been confirmed by its provider webhook. This is the single place
 * digital payments turn into a completed sale + reduced stock, and it
 * is only ever called from the idempotency-checked webhook handlers —
 * never directly from a browser request.
 */
export async function completeSaleFromPayment(params: {
  saleId: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  cashierId: string;
  branchId: string;
  companyId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: params.saleId }, include: { items: true } });
    if (!sale) throw new ApiError(404, 'Sale not found');
    if (sale.status === 'COMPLETED') {
      // Idempotent no-op: a duplicate webhook must never double-charge
      // inventory or create a second receipt (spec section 33/40/41).
      return tx.sale.findUnique({ where: { id: sale.id }, include: { items: true, receipt: true } });
    }
    if (sale.status !== 'PENDING') {
      throw new ApiError(409, `Cannot complete sale in status ${sale.status}`);
    }

    for (const item of sale.items) {
      await applyStockMovement(tx, {
        productId: item.productId,
        branchId: params.branchId,
        delta: -item.quantity,
        movementType: 'SALE',
        referenceType: 'SALE',
        referenceId: sale.id,
      });
    }

    await tx.salePayment.create({
      data: { saleId: sale.id, method: params.method, amount: params.amount, reference: params.reference },
    });

    const updated = await tx.sale.update({ where: { id: sale.id }, data: { status: 'COMPLETED' } });

    const receipt = await tx.receipt.create({
      data: {
        saleId: sale.id,
        receiptNumber: await generateReceiptNumber(tx, params.companyId),
        cashierId: params.cashierId,
        paymentMethod: params.method,
        paymentReference: params.reference,
      },
    });

    await recordAudit(tx, {
      companyId: params.companyId,
      userId: params.cashierId,
      action: 'PAYMENT_COMPLETED',
      entity: 'Sale',
      entityId: sale.id,
      newData: { method: params.method, reference: params.reference, receiptNumber: receipt.receiptNumber },
    });

    return { ...updated, items: sale.items, receipt };
  });
}
