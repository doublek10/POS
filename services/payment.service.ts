import { nanoid } from 'nanoid';
import { PaymentMethod, PaymentProviderName } from '@prisma/client';
import { prisma } from '@/lib/database/client';
import { ApiError } from '@/lib/permissions/guard';
import { PaymentProvider } from '@/lib/payments/payment-provider';
import { MpesaProvider } from '@/lib/payments/mpesa/provider';
import { PesapalProvider } from '@/lib/payments/pesapal/provider';
import { CardProvider } from '@/lib/payments/cards/provider';
import { createSale, completeSaleFromPayment, CartLineInput } from './sales.service';

const providers: Record<PaymentProviderName, PaymentProvider | null> = {
  MPESA: new MpesaProvider(),
  PESAPAL: new PesapalProvider(),
  CARD: new CardProvider(),
  CASH: null, // cash never goes through a provider — handled synchronously in sales.service
};

export function getProvider(name: Exclude<PaymentProviderName, 'CASH'>): PaymentProvider {
  const provider = providers[name];
  if (!provider) throw new ApiError(400, `No provider configured for ${name}`);
  return provider;
}

export interface InitiateDigitalPaymentInput {
  companyId: string;
  branchId: string;
  cashierId: string;
  customerId?: string;
  items: CartLineInput[];
  provider: 'MPESA' | 'PESAPAL' | 'CARD';
  paymentMethod: PaymentMethod;
  phone?: string;
  email?: string;
}

/**
 * Creates a PENDING sale (server-priced, per spec section 42), then a
 * PENDING PaymentTransaction, then calls out to the chosen provider.
 * The sale is only ever completed by completeSaleFromPayment(), which
 * is exclusively invoked from a verified, idempotency-checked webhook
 * — never from this function's return path. This means a customer who
 * closes the tab mid-STK-push simply leaves a PENDING sale + payment,
 * which is safe: no stock was touched, no receipt was printed.
 */
export async function initiateDigitalPayment(input: InitiateDigitalPaymentInput) {
  const sale = await createSale({
    companyId: input.companyId,
    branchId: input.branchId,
    cashierId: input.cashierId,
    customerId: input.customerId,
    items: input.items,
    // no cashPayments -> sale is left PENDING
  });

  const merchantReference = `POS-${sale.id}-${nanoid(6)}`;
  const provider = getProvider(input.provider);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const callbackUrl =
    input.provider === 'MPESA'
      ? `${appUrl}/api/webhooks/mpesa`
      : input.provider === 'PESAPAL'
      ? `${appUrl}/api/webhooks/pesapal`
      : `${appUrl}/api/webhooks/cards/${(process.env.CARD_PROVIDER ?? 'default')}`;

  const transaction = await prisma.paymentTransaction.create({
    data: {
      companyId: input.companyId,
      saleId: sale.id,
      provider: input.provider,
      paymentMethod: input.paymentMethod,
      merchantReference,
      amount: sale.total,
      currency: 'KES',
      status: 'PENDING',
      customerPhone: input.phone,
      customerEmail: input.email,
    },
  });

  try {
    const result = await provider.createPayment({
      merchantReference,
      amount: Number(sale.total),
      currency: 'KES',
      phone: input.phone,
      email: input.email,
      description: `Sale ${sale.id}`,
      callbackUrl,
    });

    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { providerReference: result.providerReference, status: 'PROCESSING', rawResponse: result.raw as any },
    });

    return { sale, transaction, redirectUrl: result.redirectUrl };
  } catch (err) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', rawResponse: { error: String(err) } as any },
    });
    throw err;
  }
}

/**
 * Handles a verified webhook event with full idempotency:
 *   1. Insert a PaymentEvent row keyed on (provider, externalEventId).
 *      The unique constraint means a duplicate delivery throws here
 *      and we return early — spec sections 33/40/41.
 *   2. Look up the PaymentTransaction by merchantReference.
 *   3. Verify amount matches (never trust the webhook blindly).
 *   4. Update the transaction status.
 *   5. If COMPLETED, call completeSaleFromPayment() to reduce stock,
 *      record the sale payment, and generate the receipt.
 */
export async function processPaymentWebhook(params: {
  providerName: PaymentProviderName;
  externalEventId: string;
  eventType: string;
  merchantReference: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  amount: number;
  providerReference?: string;
  raw: unknown;
}) {
  const transaction = await prisma.paymentTransaction.findUnique({
    where: { merchantReference: params.merchantReference },
    include: { sale: true },
  });

  if (!transaction) {
    // Don't throw 500 — a provider retrying a webhook for a transaction
    // we somehow don't recognize should get a definitive "we saw this,
    // stop retrying" style response after logging, not a crash loop.
    console.error('Webhook for unknown merchantReference', params.merchantReference);
    return { handled: false as const };
  }

  let alreadyProcessed = false;
  try {
    await prisma.paymentEvent.create({
      data: {
        paymentTransactionId: transaction.id,
        provider: params.providerName,
        eventType: params.eventType,
        externalEventId: params.externalEventId,
        payload: params.raw as any,
      },
    });
  } catch (err: any) {
    // Unique constraint violation on (provider, externalEventId) = duplicate delivery.
    if (err?.code === 'P2002') {
      alreadyProcessed = true;
    } else {
      throw err;
    }
  }

  if (alreadyProcessed) {
    return { handled: true as const, duplicate: true as const };
  }

  // Amount verification — never trust the webhook's status alone.
  const amountMatches = Math.abs(params.amount - Number(transaction.amount)) < 1; // 1 unit tolerance for rounding
  if (params.status === 'COMPLETED' && !amountMatches) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', rawResponse: params.raw as any },
    });
    await prisma.paymentEvent.updateMany({
      where: { paymentTransactionId: transaction.id, externalEventId: params.externalEventId },
      data: { processed: true, processedAt: new Date() },
    });
    console.error('Webhook amount mismatch', {
      expected: transaction.amount,
      got: params.amount,
      merchantReference: params.merchantReference,
    });
    return { handled: true as const, duplicate: false as const, mismatch: true as const };
  }

  await prisma.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: params.status,
      providerReference: params.providerReference ?? transaction.providerReference,
      rawResponse: params.raw as any,
    },
  });

  if (params.status === 'COMPLETED' && transaction.saleId) {
    const sale = transaction.sale!;
    await completeSaleFromPayment({
      saleId: transaction.saleId,
      method: transaction.paymentMethod,
      amount: Number(transaction.amount),
      reference: params.providerReference ?? params.externalEventId,
      cashierId: sale.cashierId,
      branchId: sale.branchId,
      companyId: sale.companyId,
    });
  }

  await prisma.paymentEvent.updateMany({
    where: { paymentTransactionId: transaction.id, externalEventId: params.externalEventId },
    data: { processed: true, processedAt: new Date() },
  });

  return { handled: true as const, duplicate: false as const };
}
