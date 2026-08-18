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

export async function GET() {
  try {
    const session = await requirePermission('suppliers.view');
    const suppliers = await prisma.supplier.findMany({
      where: { companyId: session.companyId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ suppliers });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('suppliers.create');
    const body = schema.parse(await req.json());
    const supplier = await prisma.supplier.create({ data: { companyId: session.companyId, ...body } });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
