import { NextRequest, NextResponse } from 'next/server';
import { CardProvider } from '@/lib/payments/cards/provider';
import { processPaymentWebhook } from '@/services/payment.service';

const provider = new CardProvider();

/**
 * The [provider] segment (e.g. /api/webhooks/cards/flutterwave) exists
 * so multiple gateways can be wired up side by side later; today it's
 * purely a routing label — the actual verification/parsing lives in
 * CardProvider, matched to whatever CARD_PROVIDER is configured.
 */
export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  const rawBody = await req.text();

  try {
    const verified = await provider.verifyWebhook(rawBody, req.headers);
    if (!verified.valid) {
      console.error(`Invalid card webhook signature from ${params.provider}`);
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    await processPaymentWebhook({
      providerName: 'CARD',
      externalEventId: verified.externalEventId,
      eventType: 'WEBHOOK',
      merchantReference: verified.merchantReference,
      status: verified.status,
      amount: verified.amount,
      providerReference: verified.providerReference,
      raw: verified.raw,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Card webhook processing error', err);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
