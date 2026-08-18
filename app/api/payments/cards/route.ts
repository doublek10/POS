import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { initiateDigitalPayment } from '@/services/payment.service';

const schema = z.object({
  branchId: z.string(),
  customerId: z.string().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive(), discount: z.number().nonnegative().optional() })).min(1),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('payments.create');
    const body = schema.parse(await req.json());

    const result = await initiateDigitalPayment({
      companyId: session.companyId,
      branchId: body.branchId,
      cashierId: session.userId,
      customerId: body.customerId,
      items: body.items,
      provider: 'CARD',
      paymentMethod: 'VISA',
      email: body.email,
    });

    return NextResponse.json(
      {
        saleId: result.sale.id,
        transactionId: result.transaction.id,
        merchantReference: result.transaction.merchantReference,
        redirectUrl: result.redirectUrl, // frontend redirects the customer here for 3DS/hosted checkout
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
