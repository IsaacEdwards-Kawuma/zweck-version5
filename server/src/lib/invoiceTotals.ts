import type { InvoiceCurrency } from "@prisma/client";

function roundForCurrency(amount: number, currency: InvoiceCurrency): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "UGX") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

export type InvoiceLineItemInput = {
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export type InvoiceLineItemComputed = {
  taxAmount: number;
  subtotal: number;
  total: number;
};

/** Calculates line totals and aggregates. Currency rounding is applied consistently per line. */
export function computeInvoiceLineItemTotals(input: InvoiceLineItemInput, currency: InvoiceCurrency): InvoiceLineItemComputed {
  const q = Number(input.quantity) || 0;
  const up = Number(input.unitPrice) || 0;
  const tr = Number(input.taxRate) || 0;

  const subtotalRaw = up * q;
  const taxRaw = subtotalRaw * (tr / 100);

  const subtotal = roundForCurrency(subtotalRaw, currency);
  const taxAmount = roundForCurrency(taxRaw, currency);
  const total = roundForCurrency(subtotal + taxAmount, currency);

  return { subtotal, taxAmount, total };
}

export function computeInvoiceTotals(
  lineItems: Array<InvoiceLineItemInput>,
  currency: InvoiceCurrency
): { subtotal: number; taxAmount: number; totalAmount: number } {
  let subtotal = 0;
  let taxAmount = 0;
  for (const li of lineItems) {
    const c = computeInvoiceLineItemTotals(li, currency);
    subtotal += c.subtotal;
    taxAmount += c.taxAmount;
  }
  subtotal = roundForCurrency(subtotal, currency);
  taxAmount = roundForCurrency(taxAmount, currency);
  const totalAmount = roundForCurrency(subtotal + taxAmount, currency);
  return { subtotal, taxAmount, totalAmount };
}

