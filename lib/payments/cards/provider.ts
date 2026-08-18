import crypto from 'crypto';
import {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  CheckPaymentResult,
  WebhookVerificationResult,
  RefundResult,
} from '../payment-provider';

/**
 * Card gateway adapter.
 *
 * The spec is explicit (section 36) that Visa/Mastercard are not
 * themselves your webhook provider — you integrate through a card
 * acquirer/gateway (Stripe, Flutterwave, Pesapal's own card rails,
 * a local bank's gateway, etc). Which one you pick is a business
 * decision, so this adapter is written against a generic
 * "create payment intent -> redirect/3DS -> signed webhook" shape
 * that Stripe, Flutterwave, and most acquirers share closely enough
 * that swapping the two fetch() calls below for the real SDK is a
 * small, contained change — the rest of the POS (sales, inventory,
 * receipts) never needs to know which gateway is behind this class.
 *
 * CARD_PROVIDER, CARD_API_KEY, CARD_WEBHOOK_SECRET come from env.
 */
export class CardProvider implements PaymentProvider {
  readonly name = 'CARD' as const;

  private apiBase() {
    const provider = process.env.CARD_PROVIDER;
    switch (provider) {
      case 'flutterwave':
        return 'https://api.flutterwave.com/v3';
      case 'stripe':
        return 'https://api.stripe.com/v1';
      default:
        throw new Error(
          `CARD_PROVIDER="${provider}" has no configured endpoint — add it in lib/payments/cards/provider.ts`
        );
    }
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const apiKey = process.env.CARD_API_KEY;
    if (!apiKey) throw new Error('CARD_API_KEY not configured');

    // Generic "create a hosted payment page" call. Replace the body
    // shape with your chosen gateway's actual API contract.
    const res = await fetch(`${this.apiBase()}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_ref: params.merchantReference,
        amount: params.amount,
        currency: params.currency,
        redirect_url: params.callbackUrl,
        customer: { email: params.email, phonenumber: params.phone },
        customizations: { description: params.description },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Card payment creation failed: ${JSON.stringify(data)}`);

    return {
      providerReference: data.data?.id ?? data.id ?? params.merchantReference,
      redirectUrl: data.data?.link ?? data.link,
      raw: data,
    };
  }

  async checkPayment(providerReference: string): Promise<CheckPaymentResult> {
    const apiKey = process.env.CARD_API_KEY;
    if (!apiKey) throw new Error('CARD_API_KEY not configured');

    const res = await fetch(`${this.apiBase()}/transactions/${providerReference}/verify`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();

    const map: Record<string, CheckPaymentResult['status']> = {
      successful: 'COMPLETED',
      failed: 'FAILED',
      cancelled: 'CANCELLED',
    };
    return { status: map[data.data?.status] ?? 'PENDING', providerReference, raw: data };
  }

  /**
   * Verifies the webhook's HMAC signature against CARD_WEBHOOK_SECRET
   * before trusting anything in the payload — this is the pattern
   * shared by essentially every card gateway (Stripe-style
   * `Stripe-Signature`, Flutterwave-style `verif-hash`, etc). Adjust
   * the header name and hashing scheme to match your chosen provider's
   * docs; the important invariant — reject on mismatch, never process
   * an unverified body — must stay.
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerificationResult> {
    const secret = process.env.CARD_WEBHOOK_SECRET;
    const signature = headers.get('verif-hash') ?? headers.get('x-webhook-signature') ?? '';

    if (!secret) throw new Error('CARD_WEBHOOK_SECRET not configured');

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    if (!valid) {
      return { valid: false, externalEventId: 'invalid', merchantReference: '', status: 'FAILED', amount: 0, raw: rawBody };
    }

    const body = JSON.parse(rawBody);
    const statusMap: Record<string, 'COMPLETED' | 'FAILED' | 'CANCELLED'> = {
      successful: 'COMPLETED',
      completed: 'COMPLETED',
      failed: 'FAILED',
      cancelled: 'CANCELLED',
    };

    return {
      valid: true,
      externalEventId: String(body.id ?? body.event_id ?? body.data?.id),
      merchantReference: String(body.data?.tx_ref ?? body.merchantReference),
      status: statusMap[String(body.data?.status ?? body.status).toLowerCase()] ?? 'FAILED',
      amount: Number(body.data?.amount ?? 0),
      providerReference: String(body.data?.id ?? body.id),
      raw: body,
    };
  }

  async refundPayment(providerReference: string, amount: number): Promise<RefundResult> {
    const apiKey = process.env.CARD_API_KEY;
    if (!apiKey) throw new Error('CARD_API_KEY not configured');
    const res = await fetch(`${this.apiBase()}/transactions/${providerReference}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Card refund failed: ${JSON.stringify(data)}`);
    return { refundReference: data.data?.id ?? providerReference, raw: data };
  }
}
