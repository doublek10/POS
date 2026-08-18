import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, ApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { hashPassword } from '@/lib/auth/password';
import { recordAudit } from '@/lib/audit';
import { RoleName } from '@prisma/client';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.nativeEnum(RoleName),
});

/**
 * Only the OWNER can create employees (section 2: "Add product
 * managers", "Add cashiers"). Note there is no permission string a
 * PRODUCT_MANAGER or CASHIER role could ever be granted that would let
 * them reach this route, short of an owner explicitly editing
 * ROLE_PERMISSIONS in code — which is the intended way to change
 * policy, not a runtime request.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('users.create');
    const body = schema.parse(await req.json());

    if (body.role === 'OWNER') {
      throw new ApiError(400, 'Cannot create additional OWNER accounts through this endpoint');
    }

    const role = await prisma.role.findUnique({ where: { name: body.role } });
    if (!role) throw new ApiError(500, `Role ${body.role} is not seeded`);

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId: session.companyId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          passwordHash,
          roleId: role.id,
        },
      });
      await recordAudit(tx, {
        companyId: session.companyId,
        userId: session.userId,
        action: body.role === 'PRODUCT_MANAGER' ? 'OWNER_CREATED_PRODUCT_MANAGER' : 'OWNER_CREATED_CASHIER',
        entity: 'User',
        entityId: created.id,
        newData: { name: created.name, email: created.email, role: body.role },
      });
      return created;
    });

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: body.role } }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const session = await requirePermission('users.view');
    const users = await prisma.user.findMany({
      where: { companyId: session.companyId },
      select: { id: true, name: true, email: true, phone: true, status: true, role: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}
