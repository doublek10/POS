'use client';

/**
 * Direct-to-hardware printing over WebUSB.
 *
 * Most USB thermal receipt printers (Epson TM-T20/T88, and the large
 * family of ESC/POS-compatible clones — Xprinter, Rongta, Zjiang,
 * GoJieDian, etc.) expose a plain USB bulk-transfer interface that
 * accepts raw ESC/POS bytes. WebUSB (Chrome/Edge — this is why the
 * launcher in /desktop-launcher opens Edge specifically) lets a web
 * page talk to that interface directly, with no OS print driver, no
 * print dialog, and no PDF step in between.
 *
 * This is genuinely "if a real printer is connected it can print" —
 * requestPrinter() only resolves for a printer the user has picked
 * from the browser's own device chooser and physically has plugged in
 * and powered on; there's no way to print to a printer that isn't
 * really there.
 *
 * Not every environment supports WebUSB (Safari/Firefox don't, and a
 * printer might be network/Bluetooth instead of USB) — see
 * printViaBrowserDialog() in ReceiptPrint.tsx for the universal
 * fallback that works with literally any printer via the OS print
 * dialog and @media print CSS.
 */

// A conservative allowlist of common thermal-printer USB vendor IDs.
// This only narrows the browser's device picker to relevant hardware —
// it is not a security boundary, and users can still pick "show all
// devices" in the chooser if their printer's VID isn't listed here.
const KNOWN_PRINTER_VENDOR_IDS = [
  0x04b8, // Epson
  0x0483, // STMicro (many Xprinter/Rongta clones use this)
  0x0fe6, // ICS Advent / various clones
  0x1fc9, // NXP (some Zjiang/GoJieDian boards)
  0x28e9, // GD32-based clone boards
];

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export interface ConnectedPrinter {
  device: USBDevice;
  interfaceNumber: number;
  endpointOut: number;
}

/**
 * Opens the browser's native device picker filtered to likely thermal
 * printers, then claims the correct USB interface/endpoint for writing.
 * Throws if the user cancels the picker or no compatible interface is
 * found on the chosen device.
 */
export async function requestPrinter(): Promise<ConnectedPrinter> {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB is not supported in this browser. Use Chrome or Edge, over HTTPS or localhost.');
  }

  const device = await navigator.usb.requestDevice({
    filters: KNOWN_PRINTER_VENDOR_IDS.map((vendorId) => ({ vendorId })),
  });

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  // Find the interface with a bulk OUT endpoint — that's the one ESC/POS
  // printers use to receive print data (class 7 = "printer" per the USB
  // spec, but clones are inconsistent about declaring it correctly, so
  // we search by endpoint shape rather than trusting the class code).
  let interfaceNumber = -1;
  let endpointOut = -1;

  for (const iface of device.configuration!.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === 'out');
      if (out) {
        interfaceNumber = iface.interfaceNumber;
        endpointOut = out.endpointNumber;
        break;
      }
    }
    if (interfaceNumber !== -1) break;
  }

  if (interfaceNumber === -1) {
    await device.close();
    throw new Error('No printable (bulk OUT) interface found on this device — is it a printer?');
  }

  await device.claimInterface(interfaceNumber);

  return { device, interfaceNumber, endpointOut };
}

export async function printBytes(printer: ConnectedPrinter, bytes: Uint8Array): Promise<void> {
  // Real thermal printer USB buffers are small (often ~4KB or less), so
  // long receipts must be chunked rather than sent in one transfer.
  const CHUNK = 2048;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const chunk = bytes.slice(offset, offset + CHUNK);
    const result = await printer.device.transferOut(printer.endpointOut, chunk);
    if (result.status !== 'ok') {
      throw new Error(`Printer transfer failed with status: ${result.status}`);
    }
  }
}

export async function disconnectPrinter(printer: ConnectedPrinter): Promise<void> {
  try {
    await printer.device.releaseInterface(printer.interfaceNumber);
    await printer.device.close();
  } catch {
    // Already disconnected (e.g. user unplugged it) — nothing to do.
  }
}

/**
 * Attempts to silently reconnect to a printer the user already granted
 * permission for in a previous session, so the till doesn't need to
 * re-pick the printer from the chooser every single sale. Returns null
 * if nothing was previously authorized or it's no longer plugged in.
 */
export async function reconnectKnownPrinter(): Promise<ConnectedPrinter | null> {
  if (!isWebUsbSupported()) return null;
  const devices = await navigator.usb.getDevices();
  const device = devices[0];
  if (!device) return null;

  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  let interfaceNumber = -1;
  let endpointOut = -1;
  for (const iface of device.configuration!.interfaces) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === 'out');
      if (out) {
        interfaceNumber = iface.interfaceNumber;
        endpointOut = out.endpointNumber;
        break;
      }
    }
    if (interfaceNumber !== -1) break;
  }
  if (interfaceNumber === -1) return null;

  await device.claimInterface(interfaceNumber);
  return { device, interfaceNumber, endpointOut };
}
