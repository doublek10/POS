import {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  CheckPaymentResult,
  WebhookVerificationResult,
  RefundResult,
} from '../payment-provider';

const PESAPAL_BASE = {
  sandbox: 'https://cybqa.pesapal.com/pesapalv3',
  production: 'https://pay.pesapal.com/v3',
};

function baseUrl() {
  return process.env.PESAPAL_ENV === 'production' ? PESAPAL_BASE.production : PESAPAL_BASE.sandbox;
}

async function getAccessToken(): Promise<string> {
  const key = process.env.PESAPAL_CONSUMER_KEY;
  const secret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET not configured');

  const res = await fetch(`${baseUrl()}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  if (!res.ok) throw new Error(`PesaPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

/**
 * PesaPal API 3.0 adapter (REST/JSON). API 2.0 is deprecated per
 * PesaPal's own developer docs — this integration only targets 3.0.
 *
 * PesaPal requires an IPN URL to be registered once via
 * /api/URLSetup/RegisterIPN, which returns an ipn_id you then pass on
 * every order submission (PESAPAL_IPN_ID in the environment). Run that
 * registration step once as part of deployment setup, not per-request.
 */
export class PesapalProvider implements PaymentProvider {
  readonly name = 'PESAPAL' as const;

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const ipnId = process.env.PESAPAL_IPN_ID;
    if (!ipnId) {
      throw new Error(
        'PESAPAL_IPN_ID not configured — register your IPN URL once via /api/URLSetup/RegisterIPN and set the returned id'
      );
    }
    const token = await getAccessToken();

    const res = await fetch(`${baseUrl()}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: params.merchantReference,
        currency: params.currency,
        amount: params.amount,
        description: params.description,
        callback_url: params.callbackUrl,
        notification_id: ipnId,
        billing_address: { email_address: params.email ?? '', phone_number: params.phone ?? '' },
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`PesaPal order submission failed: ${JSON.stringify(data.error ?? data)}`);
    }

    return {
      providerReference: data.order_tracking_id,
      redirectUrl: data.redirect_url,
      raw: data,
    };
  }

  async checkPayment(providerReference: string): Promise<CheckPaymentResult> {
    const token = await getAccessToken();
    const res = await fetch(
      `${baseUrl()}/api/Transactions/GetTransactionStatus?orderTrackingId=${providerReference}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    const data = await res.json();

    const map: Record<string, CheckPaymentResult['status']> = {
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      INVALID: 'FAILED',
      REVERSED: 'CANCELLED',
    };

    return {
      status: map[data.payment_status_description] ?? 'PENDING',
      providerReference,
      raw: data,
    };
  }

  /**
   * PesaPal's IPN delivers { OrderTrackingId, OrderMerchantReference,
   * OrderNotificationType }. It does not carry final status — you must
   * call GetTransactionStatus to confirm, which is why this method
   * calls checkPayment() internally rather than trusting the IPN body
   * alone (mirrors PesaPal's documented integration pattern).
   */
  async verifyWebhook(rawBody: string, _headers: Headers): Promise<WebhookVerificationResult> {
    const body = JSON.parse(rawBody);
    const trackingId = body.OrderTrackingId ?? body.orderTrackingId;
    const merchantRef = body.OrderMerchantReference ?? body.orderMerchantReference;

    if (!trackingId || !merchantRef) {
      return { valid: false, externalEventId: 'invalid', merchantReference: '', status: 'FAILED', amount: 0, raw: body };
    }

    const confirmed = await this.checkPayment(trackingId);
    const confirmedRaw = confirmed.raw as any;

    return {
      valid: true,
      externalEventId: trackingId, // PesaPal notifications are keyed by tracking id
      merchantReference: merchantRef,
      status: confirmed.status === 'PENDING' ? 'FAILED' : confirmed.status,
      amount: Number(confirmedRaw?.amount ?? 0),
      providerReference: trackingId,
      raw: { ipn: body, statusCheck: confirmed.raw },
    };
  }

  async refundPayment(providerReference: string, amount: number): Promise<RefundResult> {
    const token = await getAccessToken();
    const res = await fetch(`${baseUrl()}/api/Transactions/RefundRequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_code: providerReference, amount, remarks: 'POS refund' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`PesaPal refund failed: ${JSON.stringify(data)}`);
    return { refundReference: data.refund_id ?? providerReference, raw: data };
  }
}
