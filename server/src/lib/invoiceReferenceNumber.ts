import type { InvoiceType } from "@prisma/client";
import { prisma } from "./prisma.js";

function prefixForType(t: InvoiceType) {
  switch (t) {
    case "SALES":
      return "INV";
    case "PURCHASE":
      return "PUR";
    case "PROFORMA":
      return "PRO";
    case "CREDIT_NOTE":
      return "CN";
    default:
      return String(t);
  }
}

function yearMonthKey(d: Date): string {
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return ym;
}

/** Sequential ZWK-{INV|PUR|PRO|CN}-YYYY-MM-XXXX per invoiceType per calendar month (UTC). */
export async function allocateNextInvoiceNumber(invoiceType: InvoiceType, invoiceDate: Date): Promise<string> {
  const ym = yearMonthKey(invoiceDate);
  const prefix = prefixForType(invoiceType);

  const rows = await prisma.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "InvoiceReferenceSequence" ("invoiceType", "yearMonth", "lastSeq")
    VALUES (${invoiceType}, ${ym}, 1)
    ON CONFLICT ("invoiceType", "yearMonth")
    DO UPDATE SET "lastSeq" = "InvoiceReferenceSequence"."lastSeq" + 1
    RETURNING "lastSeq"
  `;

  const seq = rows[0]?.lastSeq ?? 1;
  return `ZWK-${prefix}-${ym}-${String(seq).padStart(4, "0")}`;
}

/** Preview next number (does not reserve). */
export async function peekNextInvoiceNumber(invoiceType: InvoiceType, invoiceDate: Date): Promise<string> {
  const ym = yearMonthKey(invoiceDate);
  const prefix = prefixForType(invoiceType);

  const row = await prisma.invoiceReferenceSequence.findUnique({
    where: { invoiceType_yearMonth: { invoiceType, yearMonth: ym } }
  });
  const next = (row?.lastSeq ?? 0) + 1;
  return `ZWK-${prefix}-${ym}-${String(next).padStart(4, "0")}`;
}

