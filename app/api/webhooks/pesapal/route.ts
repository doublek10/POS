import { NextRequest, NextResponse } from 'next/server';
import { PesapalProvider } from '@/lib/payments/pesapal/provider';
import { processPaymentWebhook } from '@/services/payment.service';

const provider = new PesapalProvider();

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  try {
    const verified = await provider.verifyWebhook(rawBody, req.headers);
    if (!verified.valid) {
      console.error('Invalid PesaPal IPN payload', rawBody);
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    await processPaymentWebhook({
      providerName: 'PESAPAL',
      externalEventId: verified.externalEventId,
      eventType: 'IPN',
      merchantReference: verified.merchantReference,
      status: verified.status,
      amount: verified.amount,
      providerReference: verified.providerReference,
      raw: verified.raw,
    });

    // PesaPal expects this exact acknowledgement shape.
    return NextResponse.json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId: verified.providerReference,
      orderMerchantReference: verified.merchantReference,
      status: 200,
    });
  } catch (err) {
    console.error('PesaPal IPN processing error', err);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

// PesaPal also allows GET-based IPN delivery in some configurations.
export async function GET(req: NextRequest) {
  const trackingId = req.nextUrl.searchParams.get('OrderTrackingId');
  const merchantRef = req.nextUrl.searchParams.get('OrderMerchantReference');
  if (!trackingId || !merchantRef) {
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }
  return POST(
    new NextRequest(req.url, {
      method: 'POST',
      body: JSON.stringify({ OrderTrackingId: trackingId, OrderMerchantReference: merchantRef }),
    })
  );
}
