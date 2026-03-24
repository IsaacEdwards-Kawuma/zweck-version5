import { TxType } from "@prisma/client";

export type AccountKey =
  | "bank"
  | "mmf"
  | "ypa"
  | "loan_liability"
  | "capital"
  | "side_fund"
  | "mmf_income"
  | "penalties"
  | "reg_costs"
  | "tx_charge"
  | "legal"
  | "other_exp";

export const ACCOUNTS: Record<AccountKey, { name: string; group: "Assets" | "Liabilities" | "Equity" | "Income" | "Expenses" }> =
  {
    bank: { name: "Bank Account", group: "Assets" },
    mmf: { name: "MMF Investment", group: "Assets" },
    ypa: { name: "YPA Goats Investment", group: "Assets" },
    loan_liability: { name: "Loan Liability", group: "Liabilities" },

    capital: { name: "Capital Contributions", group: "Equity" },
    side_fund: { name: "Side Fund", group: "Equity" },

    mmf_income: { name: "MMF Returns", group: "Income" },
    penalties: { name: "Penalties & Surcharges", group: "Income" },

    reg_costs: { name: "Registration Costs", group: "Expenses" },
    tx_charge: { name: "Transaction Charges", group: "Expenses" },
    legal: { name: "Legal / Consultation", group: "Expenses" },
    other_exp: { name: "Other Expenses", group: "Expenses" }
  };

export const TX_ACCOUNT_MAP: Record<
  TxType,
  { debit: AccountKey; credit: AccountKey; needsDirector: boolean }
> = {
  CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
  SIDE_FUND: { debit: "bank", credit: "side_fund", needsDirector: true },
  MMF_DEPLOY: { debit: "mmf", credit: "bank", needsDirector: false },
  MMF_RETURN: { debit: "bank", credit: "mmf_income", needsDirector: false },
  YPA_INVEST: { debit: "ypa", credit: "bank", needsDirector: false },
  REGISTRATION: { debit: "reg_costs", credit: "bank", needsDirector: false },
  TX_CHARGE: { debit: "tx_charge", credit: "bank", needsDirector: false },
  LEGAL: { debit: "legal", credit: "bank", needsDirector: false },
  PENALTY: { debit: "bank", credit: "penalties", needsDirector: true },
  LOAN_IN: { debit: "bank", credit: "loan_liability", needsDirector: false },
  OTHER_OUT: { debit: "other_exp", credit: "bank", needsDirector: false }
};

export function emptyBalances(): Record<AccountKey, number> {
  const out = {} as Record<AccountKey, number>;
  for (const k of Object.keys(ACCOUNTS) as AccountKey[]) out[k] = 0;
  return out;
}

