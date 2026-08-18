import {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  CheckPaymentResult,
  WebhookVerificationResult,
  RefundResult,
} from '../payment-provider';

const DARAJA_BASE = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

function baseUrl() {
  return process.env.MPESA_ENV === 'production' ? DARAJA_BASE.production : DARAJA_BASE.sandbox;
}

async function getAccessToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) {
    throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not configured');
  }
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja OAuth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

/**
 * Daraja 3.0 STK Push (Lipa na M-Pesa Online) adapter.
 *
 * This talks to the real Safaricom sandbox/production endpoints once
 * MPESA_CONSUMER_KEY/SECRET/PASSKEY/SHORTCODE are set in the environment.
 * With those unset, createPayment() throws clearly rather than silently
 * pretending to succeed — see services/payment.service.ts for how the
 * demo/stub mode is selected instead.
 */
export class MpesaProvider implements PaymentProvider {
  readonly name = 'MPESA' as const;

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    if (!shortcode || !passkey) throw new Error('MPESA_SHORTCODE / MPESA_PASSKEY not configured');
    if (!params.phone) throw new Error('M-Pesa STK push requires a customer phone number');

    const ts = timestamp();
    const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
    const token = await getAccessToken();

    const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(params.amount),
        PartyA: params.phone,
        PartyB: shortcode,
        PhoneNumber: params.phone,
        CallBackURL: params.callbackUrl,
        AccountReference: params.merchantReference,
        TransactionDesc: params.description,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.ResponseCode !== '0') {
      throw new Error(`STK push failed: ${data.errorMessage ?? JSON.stringify(data)}`);
    }

    return {
      providerReference: data.CheckoutRequestID,
      raw: data,
    };
  }

  async checkPayment(providerReference: string): Promise<CheckPaymentResult> {
    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    if (!shortcode || !passkey) throw new Error('MPESA_SHORTCODE / MPESA_PASSKEY not configured');

    const ts = timestamp();
    const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
    const token = await getAccessToken();

    const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        CheckoutRequestID: providerReference,
      }),
    });
    const data = await res.json();

    const status =
      data.ResultCode === '0' ? 'COMPLETED' : data.ResultCode === undefined ? 'PENDING' : 'FAILED';

    return { status, providerReference, raw: data };
  }

  /**
   * Verifies an inbound Daraja callback. Daraja does not sign callbacks
   * with a shared secret the way PesaPal/most card gateways do — the
   * standard mitigation is to (a) only trust the CheckoutRequestID you
   * already created a PENDING payment for, and (b) optionally restrict
   * the callback URL by IP allowlist at the infrastructure level. We
   * derive `externalEventId` from Safaricom's own IDs so the same
   * callback delivered twice is recognized as the same event.
   */
  async verifyWebhook(rawBody: string, _headers: Headers): Promise<WebhookVerificationResult> {
    const body = JSON.parse(rawBody);
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) {
      return {
        valid: false,
        externalEventId: 'invalid',
        merchantReference: '',
        status: 'FAILED',
        amount: 0,
        raw: body,
      };
    }

    const resultCode: number = stkCallback.ResultCode;
    const checkoutRequestId: string = stkCallback.CheckoutRequestID;
    const merchantRequestId: string = stkCallback.MerchantRequestID;

    const items: { Name: string; Value?: unknown }[] = stkCallback.CallbackMetadata?.Item ?? [];
    const get = (name: string) => items.find((i) => i.Name === name)?.Value;

    return {
      valid: true,
      externalEventId: `${merchantRequestId}:${checkoutRequestId}`,
      merchantReference: String(get('AccountReference') ?? checkoutRequestId),
      status: resultCode === 0 ? 'COMPLETED' : 'FAILED',
      amount: Number(get('Amount') ?? 0),
      providerReference: String(get('MpesaReceiptNumber') ?? checkoutRequestId),
      raw: body,
    };
  }

  async refundPayment(_providerReference: string, _amount: number): Promise<RefundResult> {
    // Daraja has no direct "refund" API — M-Pesa reversals go through
    // the separate B2C/Reversal API and typically require manual
    // approval workflows. Wire that up here when needed; for now this
    // is an explicit not-implemented rather than a silent no-op.
    throw new Error('M-Pesa reversal requires the Daraja B2C/Reversal API — not yet implemented');
  }
}
