import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';

/** Owner-only view of the full audit trail (spec section 49). */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('audit.view');
    const logs = await prisma.auditLog.findMany({
      where: { companyId: session.companyId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ logs });
  } catch (err) {
    return handleApiError(err);
  }
}
