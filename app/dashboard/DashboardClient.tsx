'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Report {
  todaysSales: number;
  todaysProfit: number;
  orders: number;
  byPaymentMethod: Record<string, number>;
  topCashiers: { name: string; total: number }[];
  lowStock: { id: string; name: string; sku: string; quantity: number; reorderLevel: number }[];
}

export default function DashboardClient({ ownerName }: { ownerName: string }) {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    apiFetch<Report>('/api/reports').then(setReport).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-black/5">
        <div>
          <p className="text-xs text-ink/40 uppercase tracking-wide">Business dashboard</p>
          <h1 className="text-lg font-semibold">Welcome back, {ownerName}</h1>
        </div>
        <nav className="flex gap-5 text-sm">
          <a href="/products" className="text-ink/60 hover:text-ink">Products</a>
          <a href="/employees" className="text-ink/60 hover:text-ink">Employees</a>
          <a href="/pos" className="text-ink/60 hover:text-ink">POS</a>
          <a href="/api/auth/logout" className="text-ink/60 hover:text-ink">Sign out</a>
        </nav>
      </header>

      <main className="p-8 max-w-6xl mx-auto space-y-8">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Today's sales" value={`KES ${(report?.todaysSales ?? 0).toLocaleString()}`} />
          <Stat label="Today's profit" value={`KES ${(report?.todaysProfit ?? 0).toLocaleString()}`} />
          <Stat label="Orders" value={String(report?.orders ?? 0)} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-black/5 p-5">
            <p className="text-xs font-medium text-ink/40 uppercase tracking-wide mb-4">By payment method</p>
            <div className="space-y-2">
              {Object.entries(report?.byPaymentMethod ?? {}).length === 0 && (
                <p className="text-sm text-ink/40">No sales yet today.</p>
              )}
              {Object.entries(report?.byPaymentMethod ?? {}).map(([method, amount]) => (
                <div key={method} className="flex justify-between text-sm">
                  <span className="text-ink/60">{method}</span>
                  <span className="font-medium">KES {amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-black/5 p-5">
            <p className="text-xs font-medium text-ink/40 uppercase tracking-wide mb-4">Top cashiers today</p>
            <div className="space-y-2">
              {(report?.topCashiers ?? []).length === 0 && <p className="text-sm text-ink/40">No sales yet today.</p>}
              {report?.topCashiers.map((c, i) => (
                <div key={c.name} className="flex justify-between text-sm">
                  <span className="text-ink/60">{i + 1}. {c.name}</span>
                  <span className="font-medium">KES {c.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-black/5 p-5">
          <p className="text-xs font-medium text-ink/40 uppercase tracking-wide mb-4">Low stock</p>
          {(report?.lowStock ?? []).length === 0 ? (
            <p className="text-sm text-ink/40">Nothing below its reorder level.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink/40 text-xs uppercase">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 font-medium text-right">Remaining</th>
                  <th className="pb-2 font-medium text-right">Reorder level</th>
                </tr>
              </thead>
              <tbody>
                {report?.lowStock.map((p) => (
                  <tr key={p.id} className="border-t border-black/5">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-ink/50">{p.sku}</td>
                    <td className="py-2 text-right text-warn font-medium">{p.quantity}</td>
                    <td className="py-2 text-right text-ink/50">{p.reorderLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-black/5 p-5">
      <p className="text-xs font-medium text-ink/40 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}
