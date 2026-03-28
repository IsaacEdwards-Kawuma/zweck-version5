import type { TransactionPostingStatus, TxType } from "@prisma/client";
import { ACCOUNTS, emptyBalances, isExpenseTxType, TX_ACCOUNT_MAP, type AccountKey } from "./constants.js";

export type Balances = Record<AccountKey, number> & Record<string, number>;

/** Fields needed to post to the derived ledger (extends Prisma Transaction over time). */
export type TxForDerive = {
  type: TxType;
  amount: number;
  currency?: string | null;
  directorId?: number | null;
  expensePaymentMode?: string | null;
  transferFromAccountKey?: string | null;
  transferToAccountKey?: string | null;
  reversalOfId?: number | null;
  postingStatus?: TransactionPostingStatus | null;
  /** When both set, balances use these keys instead of `TX_ACCOUNT_MAP`. */
  manualDebitAccountKey?: string | null;
  manualCreditAccountKey?: string | null;
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

function applyPair(
  balances: Record<string, number>,
  debitKey: string,
  creditKey: string,
  amount: number,
  swap: boolean
) {
  const d = swap ? creditKey : debitKey;
  const c = swap ? debitKey : creditKey;
  balances[d] = (balances[d] || 0) + amount;
  balances[c] = (balances[c] || 0) - amount;
}

/**
 * Applies one transaction to running balances (double-entry).
 * - Currency maps `bank` to 1200/1210/1220.
 * - Director capital uses dynamic keys `director_capital_{id}` (not the 3100 header).
 * - Director side fund uses `director_side_fund_{id}` when tagged with directorId.
 * - Expenses with ACCOUNTS_PAYABLE credit 2100 instead of bank.
 * - Inter-account transfer: debit destination, credit source.
 * - Reversal rows (`reversalOfId` set) swap debit and credit vs the normal map.
 * - Original rows with `REVERSED` remain applied so reversal pairs net correctly.
 */
export function applyTransactionToBalances(balances: Record<string, number>, tx: TxForDerive) {
  if (tx.postingStatus === "PENDING") return;

  const amt = Number(tx.amount) || 0;
  if (amt <= 0) return;

  const swap = Boolean(tx.reversalOfId);

  if (tx.manualDebitAccountKey && tx.manualCreditAccountKey) {
    applyPair(balances, tx.manualDebitAccountKey, tx.manualCreditAccountKey, amt, swap);
    return;
  }

  const map = TX_ACCOUNT_MAP[tx.type];
  if (!map) return;

  if ((map.debit === "capital" || map.credit === "capital") && !tx.directorId) {
    return;
  }
  if ((map.debit === "side_fund" || map.credit === "side_fund") && map.needsDirector && !tx.directorId) {
    return;
  }

  if (tx.type === "INTER_ACCOUNT_TRANSFER") {
    const from = tx.transferFromAccountKey as AccountKey | undefined;
    const to = tx.transferToAccountKey as AccountKey | undefined;
    if (!from || !to) return;
    const debitDest = resolveBankKey(to, tx.currency);
    const creditSrc = resolveBankKey(from, tx.currency);
    applyPair(balances, debitDest, creditSrc, amt, swap);
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

  if (map.debit === "side_fund" || map.credit === "side_fund") {
    const sfKey = tx.directorId ? `director_side_fund_${tx.directorId}` : "side_fund";
    if (map.debit === "side_fund") debit = sfKey;
    if (map.credit === "side_fund") credit = sfKey;
  }

  const bankResolved = resolveBankKey("bank", tx.currency);
  if (credit === bankResolved && isExpenseTxType(tx.type) && tx.expensePaymentMode === "ACCOUNTS_PAYABLE") {
    credit = "accounts_payable";
  }

  applyPair(balances, debit, credit, amt, swap);
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
      if (/^director_side_fund_\d+$/.test(k)) total += Number(v) || 0;
    }
  }
  return total;
}

export function abs(n: number) {
  return Math.abs(n);
}
