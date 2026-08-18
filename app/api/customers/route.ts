import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('customers.view');
    const search = req.nextUrl.searchParams.get('search');
    const customers = await prisma.customer.findMany({
      where: {
        companyId: session.companyId,
        ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return NextResponse.json({ customers });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('customers.create');
    const body = schema.parse(await req.json());
    const customer = await prisma.customer.create({ data: { companyId: session.companyId, ...body } });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
