import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/lib/permissions/guard';
import { prisma } from '@/lib/database/client';
import { lowStockProducts } from '@/services/inventory.service';

/**
 * Owner dashboard summary (spec section 50/68): today's sales, profit,
 * orders, breakdown by payment method, low stock, top cashiers/products.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission('reports.view');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaysSales = await prisma.sale.findMany({
      where: { companyId: session.companyId, status: 'COMPLETED', createdAt: { gte: startOfDay } },
      include: { items: true, payments: true, cashier: { select: { name: true } } },
    });

    const todaysTotal = todaysSales.reduce((s, sale) => s + Number(sale.total), 0);
    const todaysProfit = todaysSales.reduce(
      (sum, sale) =>
        sum +
        sale.items.reduce((s, i) => s + (Number(i.unitPrice) - Number(i.costPrice)) * i.quantity - Number(i.discount), 0),
      0
    );

    const byMethod: Record<string, number> = {};
    for (const sale of todaysSales) {
      for (const p of sale.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
      }
    }

    const byCashier: Record<string, number> = {};
    for (const sale of todaysSales) {
      byCashier[sale.cashier.name] = (byCashier[sale.cashier.name] ?? 0) + Number(sale.total);
    }
    const topCashiers = Object.entries(byCashier)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));

    const lowStock = await lowStockProducts(session.companyId);

    return NextResponse.json({
      todaysSales: todaysTotal,
      todaysProfit,
      orders: todaysSales.length,
      byPaymentMethod: byMethod,
      topCashiers,
      lowStock,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
