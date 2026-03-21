import type { Transaction, TxType } from "@prisma/client";
import { ACCOUNTS, emptyBalances, TX_ACCOUNT_MAP, type AccountKey } from "./constants.js";

export type Balances = Record<AccountKey, number>;

export function deriveBalances(transactions: Pick<Transaction, "type" | "amount">[]): Balances {
  const balances = emptyBalances();
  for (const tx of transactions) {
    const map = TX_ACCOUNT_MAP[tx.type as TxType];
    balances[map.debit] += tx.amount;
    balances[map.credit] -= tx.amount;
  }
  return balances;
}

export function sumGroup(balances: Balances, group: (typeof ACCOUNTS)[AccountKey]["group"]): number {
  let total = 0;
  for (const [k, meta] of Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][]) {
    if (meta.group === group) total += balances[k];
  }
  return total;
}

export function abs(n: number) {
  return Math.abs(n);
}

