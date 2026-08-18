'use client';

import { useState } from 'react';
import {
  isWebUsbSupported,
  requestPrinter,
  reconnectKnownPrinter,
  printBytes,
  ConnectedPrinter,
} from '@/lib/receipts/webusb-printer';
import { buildReceiptBytes, ReceiptData } from '@/lib/receipts/escpos';
import { apiFetch } from '@/lib/api-client';

let cachedPrinter: ConnectedPrinter | null = null;

export default function ReceiptPrint({ receipt }: { receipt: ReceiptData }) {
  const [status, setStatus] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  /** Universal fallback: works with ANY printer (thermal, inkjet, PDF, network) via the OS print dialog. */
  function printViaBrowserDialog() {
    window.print();
  }

  /**
   * Direct print to a connected thermal printer over WebUSB — no dialog,
   * no driver. If no printer has been authorized yet in this browser,
   * this opens the device picker first; on later receipts we reuse the
   * already-granted connection silently.
   */
  async function printViaThermalPrinter() {
    setStatus(null);
    setPrinting(true);
    try {
      if (!isWebUsbSupported()) {
        throw new Error('This browser does not support direct printer connections. Use Chrome or Edge.');
      }

      let printer = cachedPrinter ?? (await reconnectKnownPrinter());
      if (!printer) {
        printer = await requestPrinter();
      }
      cachedPrinter = printer;

      const bytes = buildReceiptBytes(receipt);
      await printBytes(printer, bytes);
      setStatus('Printed to thermal printer.');
    } catch (err) {
      cachedPrinter = null;
      setStatus(err instanceof Error ? err.message : 'Could not reach the printer — check it is connected and powered on.');
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div>
      <div id="receipt-print" className="font-mono text-xs bg-white p-4 rounded-lg border border-black/10 max-w-xs mx-auto">
        <p className="text-center font-bold">{receipt.companyName}</p>
        {receipt.companyAddress && <p className="text-center">{receipt.companyAddress}</p>}
        {receipt.companyPhone && <p className="text-center">{receipt.companyPhone}</p>}
        <p className="text-center my-2">================================</p>
        <p>Receipt: {receipt.receiptNumber}</p>
        <p>Date: {receipt.date}  Time: {receipt.time}</p>
        <p>Served by: {receipt.cashierName}</p>
        <p className="my-1">--------------------------------</p>
        {receipt.items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span>{item.qty} x {item.name}</span>
            <span>{receipt.currency ?? 'KES'} {item.total.toFixed(2)}</span>
          </div>
        ))}
        <p className="my-1">--------------------------------</p>
        <div className="flex justify-between"><span>Subtotal</span><span>{receipt.subtotal.toFixed(2)}</span></div>
        {receipt.discount > 0 && (
          <div className="flex justify-between"><span>Discount</span><span>-{receipt.discount.toFixed(2)}</span></div>
        )}
        <div className="flex justify-between"><span>Tax</span><span>{receipt.tax.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>TOTAL</span><span>{receipt.total.toFixed(2)}</span></div>
        <p className="my-1">--------------------------------</p>
        <p>Payment: {receipt.paymentMethod}</p>
        {receipt.paymentReference && <p>Ref: {receipt.paymentReference}</p>}
        <p className="text-center mt-3">Thank you for shopping!</p>
      </div>

      <div className="flex gap-2 mt-4 no-print">
        <button
          onClick={printViaBrowserDialog}
          className="flex-1 rounded-lg border border-black/10 hover:bg-black/5 text-sm font-medium py-2.5"
        >
          Print (any printer)
        </button>
        <button
          onClick={printViaThermalPrinter}
          disabled={printing}
          className="flex-1 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium py-2.5"
        >
          {printing ? 'Printing…' : 'Print to till printer'}
        </button>
      </div>
      {status && <p className="text-xs text-center mt-2 text-ink/60 no-print">{status}</p>}
    </div>
  );
}

/** Fetches a completed sale's receipt data from the API and shapes it for ReceiptPrint / buildReceiptBytes. */
export async function fetchReceiptData(saleId: string): Promise<ReceiptData> {
  const data = await apiFetch<{ sale: any }>(`/api/sales/${saleId}`);
  const sale = data.sale;
  const createdAt = new Date(sale.createdAt);

  return {
    companyName: sale.company?.name ?? 'Your Business',
    companyAddress: sale.company?.address ?? undefined,
    companyPhone: sale.company?.phone ?? undefined,
    receiptNumber: sale.receipt?.receiptNumber ?? '—',
    date: createdAt.toLocaleDateString(),
    time: createdAt.toLocaleTimeString(),
    cashierName: sale.cashier?.name ?? '',
    items: sale.items.map((i: any) => ({ name: i.productName, qty: i.quantity, total: Number(i.lineTotal) })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    paymentMethod: sale.receipt?.paymentMethod ?? sale.payments?.[0]?.method ?? '',
    paymentReference: sale.receipt?.paymentReference ?? undefined,
  };
}
