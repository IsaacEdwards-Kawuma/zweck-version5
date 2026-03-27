import type { TransactionPostingStatus, TxType } from "@prisma/client";
import { ACCOUNTS, emptyBalances, TX_ACCOUNT_MAP, type AccountKey } from "./constants.js";

export type Balances = Record<AccountKey, number> & Record<string, number>;

/** Fields needed to post to the derived ledger (extends Prisma Transaction over time). */
export type TxForDerive = {
  type: TxType;
  amount: number;
  currency?: string | null;
  directorId?: number | null;
  postingStatus?: TransactionPostingStatus | null;
};

export function bankKeyForCurrency(currency: string | null | undefined): "bank_ugx" | "bank_usd" | "bank_eur" {
  const c = currency && currency.length ? currency : "EUR";
  if (c === "UGX") return "bank_ugx";
  if (c === "USD") return "bank_usd";
  return "bank_eur";
}

function directorCapitalKey(directorId: number): string {
  return `director_capital_${directorId}`;
}

function resolveBankKey(account: AccountKey, currency: string | null | undefined): AccountKey {
  if (account === "bank") return bankKeyForCurrency(currency);
  return account;
}

function resolveCapitalKey(tx: TxForDerive): string {
  if (!tx.directorId) return "capital";
  return directorCapitalKey(tx.directorId);
}

/** Signed convention: posting increases debitKey, decreases creditKey. */
function applyPair(balances: Record<string, number>, debitKey: string, creditKey: string, amount: number) {
  balances[debitKey] = (balances[debitKey] || 0) + amount;
  balances[creditKey] = (balances[creditKey] || 0) - amount;
}

/**
 * Applies one transaction to running balances (double-entry).
 * Only `CONTRIBUTION` is supported: debit bank (by currency), credit director capital.
 */
export function applyTransactionToBalances(balances: Record<string, number>, tx: TxForDerive) {
  if (tx.postingStatus === "PENDING") return;

  const amt = Number(tx.amount) || 0;
  if (amt <= 0) return;

  const map = TX_ACCOUNT_MAP[tx.type];
  if (!map) return;

  if ((map.debit === "capital" || map.credit === "capital") && !tx.directorId) {
    return;
  }

  let debit: string = map.debit;
  let credit: string = map.credit;

  debit = resolveBankKey(debit as AccountKey, tx.currency);
  credit = resolveBankKey(credit as AccountKey, tx.currency);

  if (map.debit === "capital" || map.credit === "capital") {
    const capKey = resolveCapitalKey(tx);
    if (map.debit === "capital") debit = capKey;
    if (map.credit === "capital") credit = capKey;
  }

  applyPair(balances, debit, credit, amt);
}

export function deriveBalances(transactions: TxForDerive[]): Balances {
  const balances: Balances = { ...emptyBalances() } as Balances;
  for (const tx of transactions) {
    applyTransactionToBalances(balances, tx);
  }
  return balances;
}

export function sumGroup(balances: Balances, group: (typeof ACCOUNTS)[AccountKey]["group"]): number {
  let total = 0;
  for (const [k, meta] of Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][]) {
    if (meta.group !== group) continue;
    total += Number(balances[k] || 0);
  }
  if (group === "Equity") {
    for (const [k, v] of Object.entries(balances)) {
      if (/^director_capital_\d+$/.test(k)) total += Number(v) || 0;
    }
  }
  return total;
}

export function abs(n: number) {
  return Math.abs(n);
}
