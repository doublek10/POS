# Modern POS & Inventory Management System

A multi-role POS and inventory platform built with Next.js (App Router),
TypeScript, PostgreSQL, and Prisma — implementing the architecture laid
out in the project handbook: server-authoritative pricing, a real
inventory movement ledger, idempotent payment webhooks, and RBAC
enforced at the API layer (never just hidden buttons).

## Quick start

```bash
npm install
cp .env.example .env
# edit .env — at minimum set DATABASE_URL and AUTH_SECRET

npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Open http://localhost:3000. Demo logins (password `password123`):

| Role            | Email               |
|-----------------|----------------------|
| Owner           | owner@demo.com       |
| Product Manager | manager@demo.com     |
| Cashier         | cashier@demo.com     |

The seed also creates a demo branch, a till ("Till 01"), and three
products with real barcodes you can type into the POS search box to
simulate a barcode scan (scanners behave like keyboards, so there's no
special hardware API needed — see `app/pos/components/PosScreen.tsx`).

## What's fully implemented

- **Auth**: bcrypt password hashing, signed httpOnly JWT session cookies
  (`lib/auth`).
- **RBAC**: a permission catalogue (`lib/permissions/catalogue.ts`) and a
  `requirePermission()` guard that every API route calls first. A
  cashier's session token simply does not carry `products.delete` —
  there's no hidden-button bypass because the check isn't in the UI.
- **Products & barcodes**: CRUD, barcode lookup, SKU uniqueness per
  company.
- **Inventory**: a full movement ledger (`inventory_movements`) — stock
  is never just a mutable counter. Concurrent-sale safety is handled
  with `SELECT ... FOR UPDATE` row locking inside the sale transaction
  (`services/inventory.service.ts`), so two cashiers can't both sell the
  last unit.
- **POS sale flow**: the browser sends only `{ productId, quantity }`.
  The server reloads prices from PostgreSQL and recalculates subtotal,
  discount, tax, and total — the browser's numbers are never trusted
  (`services/sales.service.ts`, spec section 42).
- **Cash sales**: complete synchronously, one all-or-nothing database
  transaction (sale + items + payment + stock movement + receipt +
  audit log), with `Serializable` isolation.
- **Digital payments (M-Pesa / PesaPal / Card)**: a `PaymentProvider`
  interface with adapters per gateway (`lib/payments/*`). A sale is
  created `PENDING`, a `PaymentTransaction` row is created, the provider
  is called — and the sale is **only** completed, stock **only**
  reduced, and a receipt **only** generated once a verified webhook
  confirms payment (`services/payment.service.ts`). Duplicate webhook
  deliveries are rejected by a unique constraint on
  `(provider, externalEventId)`.
- **Refunds**: never mutate the original payment row; always insert a
  new `payment_refunds` row (owner-only).
- **Returns**: cashier-initiated, auto-approved for owner/manager,
  pending approval otherwise.
- **Cash registers**: open/close with expected-vs-actual cash
  reconciliation.
- **Audit log**: every state-changing action writes an `audit_logs` row
  inside the same transaction as the change it's logging.
- **Owner dashboard**: today's sales/profit/orders, breakdown by
  payment method, top cashiers, low stock.
- **Staff management**: an Employees page (`app/employees`) for the
  owner to add cashiers/product managers with a temporary password,
  and disable/re-enable accounts — wired to the existing owner-only
  `app/api/users` routes. Disabling a user blocks their next login
  immediately (checked in `app/api/auth/login`).
- **Receipt printing — two real paths**:
  1. **Any printer**, via the browser's own print dialog and an
     `@media print` stylesheet (`app/globals.css`, `#receipt-print`) —
     works with literally anything the OS can print to.
  2. **A connected thermal till printer**, via **WebUSB** direct
     printing (`lib/receipts/webusb-printer.ts` +
     `lib/receipts/escpos.ts`) — no print dialog, no driver. The
     browser's own device picker only lets you select hardware that's
     actually plugged in and powered on, so this genuinely only prints
     "if a real printer is connected." Requires Chrome or Edge (which
     is also why the desktop launcher below opens Edge specifically).
  Both buttons appear together on the receipt modal after every
  completed sale (`components/receipts/ReceiptPrint.tsx`), reachable
  from `app/pos/components/PosScreen.tsx`.
- **Desktop till launcher** (`desktop-launcher/`): a small shortcut
  for the till PC that opens Microsoft Edge directly into the POS in
  app mode (no tabs/address bar) with its own distinct icon, with an
  installer that can also auto-launch it at login. See
  `desktop-launcher/README.md`.
- **POS screen**, **product manager screen**, **login**.

## What's stubbed / needs your credentials

The three payment adapters (`lib/payments/mpesa`, `.../pesapal`,
`.../cards`) call the **real** Daraja 3.0 and PesaPal 3.0 REST
endpoints — they just need real `MPESA_*` / `PESAPAL_*` values in
`.env` to work against Safaricom's/PesaPal's sandbox or production
environment. The card adapter is written against a generic
"create payment → redirect/3DS → signed webhook" shape shared by most
acquirers (Stripe, Flutterwave, etc.) — pick a gateway and adjust the
two `fetch()` calls in `lib/payments/cards/provider.ts` to match its
actual API; the HMAC webhook verification pattern is already correct
and doesn't need to change.

Not built out in this scaffold (straightforward to add on the same
patterns already established):
- Multi-branch UI (schema fully supports it; POS defaults to the first
  branch)
- Full reports suite beyond the owner dashboard (profit/inventory/
  cashier/payment/returns reports — same query patterns as
  `app/api/reports/route.ts`)
- SMS/WhatsApp receipts, offline POS, multi-branch transfers (Phase 8
  in the handbook — explicitly "later")

## Project layout

Matches the handbook's structure exactly — see `app/`, `app/api/`,
`components/`, `lib/`, `services/`, `prisma/schema.prisma`.

## Security notes worth knowing before you deploy

- `middleware.ts` is a UX convenience (redirects logged-out users);
  the actual security boundary is `requirePermission()` inside every
  route handler. Don't remove either one, but if you ever have to
  choose, the API-level check is the one that matters.
- Card numbers/CVV are never accepted or stored anywhere in this
  codebase — only gateway references.
- Set a long random `AUTH_SECRET` before deploying; sessions are
  signed HS256 JWTs.
- Rate limiting isn't implemented at the app layer — put this behind
  a reverse proxy / WAF with rate limiting for `/api/auth/login` and
  the webhook endpoints before going to production.
