/**
 * Minimal ESC/POS command builder.
 *
 * ESC/POS is the command language almost all thermal receipt printers
 * speak (Epson TM series and the huge family of compatible clones sold
 * under Xprinter/Rongta/Zjiang etc. — the kind you'll find behind most
 * supermarket tills). This builds a raw byte stream; how those bytes
 * reach the printer (WebUSB, a local print server, a serial port) is
 * handled by the transport layer in webusb-printer.ts, not here.
 */

const ESC = 0x1b;
const GS = 0x1d;

export class EscPosBuilder {
  private chunks: number[][] = [];

  private push(bytes: number[]) {
    this.chunks.push(bytes);
    return this;
  }

  private text(str: string) {
    // Thermal printers are single-byte encodings (commonly CP437/CP1252).
    // We strip anything outside printable ASCII to avoid mojibake for
    // characters the printer's code page can't render, rather than
    // silently sending bytes that print as garbage.
    const cleaned = str.replace(/[^\x20-\x7e\n]/g, '');
    return Array.from(cleaned).map((c) => c.charCodeAt(0));
  }

  init() {
    return this.push([ESC, 0x40]); // ESC @ — initialize printer
  }

  align(mode: 'left' | 'center' | 'right') {
    const n = mode === 'left' ? 0 : mode === 'center' ? 1 : 2;
    return this.push([ESC, 0x61, n]);
  }

  bold(on: boolean) {
    return this.push([ESC, 0x45, on ? 1 : 0]);
  }

  doubleHeight(on: boolean) {
    // GS ! n — n=0x11 sets both double width and double height
    return this.push([GS, 0x21, on ? 0x11 : 0x00]);
  }

  line(str = '') {
    this.push(this.text(str));
    return this.push([0x0a]); // LF
  }

  /** Two-column line — label on the left, value right-aligned. Used for totals. */
  twoCol(label: string, value: string, width = 32) {
    const space = Math.max(1, width - label.length - value.length);
    return this.line(label + ' '.repeat(space) + value);
  }

  divider(width = 32) {
    return this.line('-'.repeat(width));
  }

  feed(lines = 1) {
    return this.push([ESC, 0x64, lines]); // ESC d n
  }

  cut() {
    return this.push([GS, 0x56, 0x00]); // GS V 0 — full cut
  }

  /** Renders a QR code (many ESC/POS-compatible printers support GS ( k). */
  qrCode(data: string, size = 6) {
    const bytes = this.text(data);
    const storeLen = bytes.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;
    this.push([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]); // model
    this.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size]); // module size
    this.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]); // error correction
    this.push([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes]); // store data
    this.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]); // print
    return this;
  }

  build(): Uint8Array {
    const flat = this.chunks.flat();
    return new Uint8Array(flat);
  }
}

export interface ReceiptData {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  receiptNumber: string;
  date: string;
  time: string;
  cashierName: string;
  items: { name: string; qty: number; total: number }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentReference?: string;
  currency?: string;
}

/** Builds the full ESC/POS byte stream for one receipt, matching spec section 28's layout. */
export function buildReceiptBytes(data: ReceiptData, width: 32 | 48 = 32): Uint8Array {
  const currency = data.currency ?? 'KES';
  const b = new EscPosBuilder();

  b.init().align('center').bold(true).doubleHeight(true);
  b.line(data.companyName);
  b.doubleHeight(false).bold(false);
  if (data.companyAddress) b.line(data.companyAddress);
  if (data.companyPhone) b.line(data.companyPhone);
  b.line('');

  b.align('left');
  b.line(`Receipt: ${data.receiptNumber}`);
  b.line(`Date: ${data.date}   Time: ${data.time}`);
  b.line(`Served by: ${data.cashierName}`);
  b.divider(width);

  for (const item of data.items) {
    b.line(`${item.name}`);
    b.twoCol(`  ${item.qty} x`, `${currency} ${item.total.toFixed(2)}`, width);
  }
  b.divider(width);

  b.twoCol('Subtotal', `${currency} ${data.subtotal.toFixed(2)}`, width);
  if (data.discount > 0) b.twoCol('Discount', `-${currency} ${data.discount.toFixed(2)}`, width);
  b.twoCol('Tax', `${currency} ${data.tax.toFixed(2)}`, width);
  b.bold(true);
  b.twoCol('TOTAL', `${currency} ${data.total.toFixed(2)}`, width);
  b.bold(false);
  b.divider(width);

  b.line(`Payment: ${data.paymentMethod}`);
  if (data.paymentReference) b.line(`Ref: ${data.paymentReference}`);

  b.feed(1);
  b.align('center');
  b.line('Thank you for shopping!');
  b.feed(3);
  b.cut();

  return b.build();
}
