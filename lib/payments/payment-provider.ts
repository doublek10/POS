/**
 * Universal payment provider contract (spec section 38).
 *
 * Every gateway (M-Pesa, PesaPal, Card) implements this interface. The
 * POS core (services/payment.service.ts, the webhook routes) only ever
 * talks to `PaymentProvider` — never to a specific SDK — so a gateway
 * can be replaced later without touching sale/inventory logic.
 */

export interface CreatePaymentParams {
  merchantReference: string; // OUR idempotency key, generated before calling the provider
  amount: number;
  currency: string;
  phone?: string; // required for M-Pesa STK push
  email?: string; // required for PesaPal / card receipts
  description: string;
  callbackUrl: string;
}

export interface CreatePaymentResult {
  /** The provider's own tracking id for this attempt (e.g. CheckoutRequestID, OrderTrackingId). */
  providerReference: string;
  /** Raw provider response, stored for debugging/audit. */
  raw: unknown;
  /** For providers that redirect the customer (PesaPal, some card flows). */
  redirectUrl?: string;
}

export interface CheckPaymentResult {
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  providerReference?: string;
  raw: unknown;
}

export interface WebhookVerificationResult {
  /** True if the signature/shared-secret check passed. Reject the request if false. */
  valid: boolean;
  /** The provider's unique id for THIS notification — used as the idempotency key
   *  against payment_events.externalEventId. Two deliveries of the same event
   *  must produce the same externalEventId. */
  externalEventId: string;
  merchantReference: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  amount: number;
  providerReference?: string;
  raw: unknown;
}

export interface RefundResult {
  refundReference: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: 'MPESA' | 'PESAPAL' | 'CARD';

  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  /** Optional polling fallback for providers whose webhook might be delayed or missed. */
  checkPayment(providerReference: string): Promise<CheckPaymentResult>;

  /** Parses + verifies an incoming webhook/callback/IPN request body and headers. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookVerificationResult>;

  refundPayment(providerReference: string, amount: number): Promise<RefundResult>;
}
