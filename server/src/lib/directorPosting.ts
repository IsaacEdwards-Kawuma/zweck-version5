import { Prisma } from "@prisma/client";
import { bankKeyForCurrency } from "./derive.js";
import type { AccountKey } from "./constants.js";

export type EntryLine = {
  side: "DEBIT" | "CREDIT";
  accountKey: string;
  directorId?: number | null;
  amount: Prisma.Decimal;
  memo?: string | null;
};

export function ymFromDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthYearLabelUtc(d: Date): string {
  return d.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function currencyBankAccountKey(currency: string): AccountKey {
  return bankKeyForCurrency(currency) as AccountKey;
}

export function assertBalanced(lines: EntryLine[]) {
  const sum = (side: "DEBIT" | "CREDIT") =>
    lines
      .filter((l) => l.side === side)
      .reduce((s, l) => s + Number(l.amount || 0), 0);
  const d = sum("DEBIT");
  const c = sum("CREDIT");
  if (Math.abs(d - c) > 1e-6) {
    throw new Error(`Director entry not balanced (debits=${d} credits=${c})`);
  }
}

