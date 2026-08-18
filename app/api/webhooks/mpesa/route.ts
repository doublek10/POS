import { NextRequest, NextResponse } from 'next/server';
import { MpesaProvider } from '@/lib/payments/mpesa/provider';
import { processPaymentWebhook } from '@/services/payment.service';

const provider = new MpesaProvider();

/**
 * Daraja delivers the STK callback here. We ALWAYS return 200 with the
 * ResultCode Safaricom expects, even on our own internal errors — if we
 * return a non-200, Daraja will retry aggressively, and if we return an
 * error status for something we already understood, retries just cause
 * duplicate-delivery noise (which processPaymentWebhook handles safely
 * anyway via the payment_events unique constraint).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  try {
    const verified = await provider.verifyWebhook(rawBody, req.headers);
    if (!verified.valid) {
      console.error('Invalid M-Pesa callback payload', rawBody);
      return okResponse();
    }

    await processPaymentWebhook({
      providerName: 'MPESA',
      externalEventId: verified.externalEventId,
      eventType: 'STK_CALLBACK',
      merchantReference: verified.merchantReference,
      status: verified.status,
      amount: verified.amount,
      providerReference: verified.providerReference,
      raw: verified.raw,
    });
  } catch (err) {
    console.error('M-Pesa webhook processing error', err);
  }

  return okResponse();
}

function okResponse() {
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
