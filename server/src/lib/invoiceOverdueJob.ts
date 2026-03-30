import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "./prisma.js";

export type InvoiceOverdueJobResult = {
  eligible: number;
  updated: number;
};

const OVERDUE_ELIGIBLE_STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PARTIALLY_PAID"];

/**
 * Mark invoices as OVERDUE when their dueDate has passed and they are not PAID or VOID.
 * Uses UTC "now" for comparison.
 */
export async function runInvoiceOverdueJob(now: Date = new Date()): Promise<InvoiceOverdueJobResult> {
  const dueBefore = now;

  const where = {
    isDeleted: false,
    dueDate: { lt: dueBefore },
    status: { in: OVERDUE_ELIGIBLE_STATUSES }
  };

  const eligible = await prisma.invoice.count({ where });
  const res = await prisma.invoice.updateMany({
    where,
    data: {
      status: "OVERDUE",
      updatedAt: new Date()
    }
  });

  return { eligible, updated: res.count };
}

