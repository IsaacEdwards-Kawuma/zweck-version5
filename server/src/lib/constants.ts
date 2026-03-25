import { TxType } from "@prisma/client";

export type AccountKey =
  | "bank"
  | "mmf"
  | "ypa"
  | "loan_liability"
  | "loan_receivable"
  | "capital"
  | "side_fund"
  | "mmf_income"
  | "penalties"
  | "income_investment"
  | "income_project"
  | "income_interest"
  | "income_dividend"
  | "income_other"
  | "income_fx"
  | "reg_costs"
  | "tx_charge"
  | "legal"
  | "other_exp"
  | "exp_transport"
  | "exp_communication"
  | "exp_office"
  | "exp_printing"
  | "exp_salaries"
  | "exp_utilities"
  | "exp_insurance"
  | "exp_meals"
  | "project_exp"
  | "capex"
  | "tax_wht"
  | "tax_vat"
  | "tax_corporate"
  | "exp_fx";

export const ACCOUNTS: Record<AccountKey, { name: string; group: "Assets" | "Liabilities" | "Equity" | "Income" | "Expenses" }> = {
  bank: { name: "Bank Account", group: "Assets" },
  mmf: { name: "MMF Investment", group: "Assets" },
  ypa: { name: "YPA Goats Investment", group: "Assets" },
  loan_receivable: { name: "Loans Receivable", group: "Assets" },
  loan_liability: { name: "Loan Liability", group: "Liabilities" },

  capital: { name: "Capital Contributions", group: "Equity" },
  side_fund: { name: "Side Fund", group: "Equity" },

  mmf_income: { name: "MMF Returns", group: "Income" },
  penalties: { name: "Penalties & Surcharges", group: "Income" },
  income_investment: { name: "Investment Returns", group: "Income" },
  income_project: { name: "Project Revenue", group: "Income" },
  income_interest: { name: "Interest Income", group: "Income" },
  income_dividend: { name: "Dividend Income", group: "Income" },
  income_other: { name: "Other Income", group: "Income" },
  income_fx: { name: "Foreign Exchange Gain", group: "Income" },

  reg_costs: { name: "Registration Costs", group: "Expenses" },
  tx_charge: { name: "Bank Charges & Fees", group: "Expenses" },
  legal: { name: "Legal & Professional Fees", group: "Expenses" },
  other_exp: { name: "Miscellaneous Expense", group: "Expenses" },
  exp_transport: { name: "Transport & Travel", group: "Expenses" },
  exp_communication: { name: "Communication & Internet", group: "Expenses" },
  exp_office: { name: "Office & Administration", group: "Expenses" },
  exp_printing: { name: "Printing & Stationery", group: "Expenses" },
  exp_salaries: { name: "Salaries & Wages", group: "Expenses" },
  exp_utilities: { name: "Utilities", group: "Expenses" },
  exp_insurance: { name: "Insurance", group: "Expenses" },
  exp_meals: { name: "Meals & Entertainment", group: "Expenses" },
  project_exp: { name: "Project Disbursements", group: "Expenses" },
  capex: { name: "Asset Purchases (Capex)", group: "Expenses" },
  tax_wht: { name: "Withholding Tax (WHT)", group: "Expenses" },
  tax_vat: { name: "VAT Payable", group: "Expenses" },
  tax_corporate: { name: "Corporate Tax Provision", group: "Expenses" },
  exp_fx: { name: "Foreign Exchange Loss", group: "Expenses" }
};

export const TX_ACCOUNT_MAP: Record<
  TxType,
  { debit: AccountKey; credit: AccountKey; needsDirector: boolean }
> = {
  CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
  CAPITAL_WITHDRAWAL: { debit: "capital", credit: "bank", needsDirector: true },
  SIDE_FUND: { debit: "bank", credit: "side_fund", needsDirector: true },
  MMF_DEPLOY: { debit: "mmf", credit: "bank", needsDirector: false },
  MMF_RETURN: { debit: "bank", credit: "mmf_income", needsDirector: false },
  YPA_INVEST: { debit: "ypa", credit: "bank", needsDirector: false },
  REGISTRATION: { debit: "reg_costs", credit: "bank", needsDirector: false },
  TX_CHARGE: { debit: "tx_charge", credit: "bank", needsDirector: false },
  LEGAL: { debit: "legal", credit: "bank", needsDirector: false },
  PENALTY: { debit: "bank", credit: "penalties", needsDirector: true },
  LOAN_IN: { debit: "bank", credit: "loan_liability", needsDirector: false },
  OTHER_OUT: { debit: "other_exp", credit: "bank", needsDirector: false },
  INVESTMENT_RETURN: { debit: "bank", credit: "income_investment", needsDirector: false },
  PROJECT_REVENUE: { debit: "bank", credit: "income_project", needsDirector: false },
  INTEREST_INCOME: { debit: "bank", credit: "income_interest", needsDirector: false },
  DIVIDEND_INCOME: { debit: "bank", credit: "income_dividend", needsDirector: false },
  OTHER_INCOME: { debit: "bank", credit: "income_other", needsDirector: false },
  PROJECT_DISBURSEMENT: { debit: "project_exp", credit: "bank", needsDirector: false },
  ASSET_PURCHASE: { debit: "capex", credit: "bank", needsDirector: false },
  LOAN_REPAYMENT_RECEIVED: { debit: "bank", credit: "loan_receivable", needsDirector: false },
  LOAN_ADVANCED: { debit: "loan_receivable", credit: "bank", needsDirector: false },
  TRANSPORT_TRAVEL: { debit: "exp_transport", credit: "bank", needsDirector: false },
  COMMUNICATION_INTERNET: { debit: "exp_communication", credit: "bank", needsDirector: false },
  OFFICE_ADMINISTRATION: { debit: "exp_office", credit: "bank", needsDirector: false },
  PRINTING_STATIONERY: { debit: "exp_printing", credit: "bank", needsDirector: false },
  SALARIES_WAGES: { debit: "exp_salaries", credit: "bank", needsDirector: false },
  UTILITIES: { debit: "exp_utilities", credit: "bank", needsDirector: false },
  INSURANCE: { debit: "exp_insurance", credit: "bank", needsDirector: false },
  MEALS_ENTERTAINMENT: { debit: "exp_meals", credit: "bank", needsDirector: false },
  DIRECTOR_LOAN_TO_COMPANY: { debit: "bank", credit: "loan_liability", needsDirector: true },
  DIRECTOR_LOAN_REPAYMENT: { debit: "loan_liability", credit: "bank", needsDirector: true },
  LOAN_REPAYMENT_EXTERNAL: { debit: "loan_liability", credit: "bank", needsDirector: false },
  WITHHOLDING_TAX: { debit: "tax_wht", credit: "bank", needsDirector: false },
  VAT_PAYABLE: { debit: "tax_vat", credit: "bank", needsDirector: false },
  CORPORATE_TAX_PROVISION: { debit: "tax_corporate", credit: "bank", needsDirector: false },
  FOREIGN_EXCHANGE_GAIN: { debit: "bank", credit: "income_fx", needsDirector: false },
  FOREIGN_EXCHANGE_LOSS: { debit: "exp_fx", credit: "bank", needsDirector: false }
};

export function emptyBalances(): Record<AccountKey, number> {
  const out = {} as Record<AccountKey, number>;
  for (const k of Object.keys(ACCOUNTS) as AccountKey[]) out[k] = 0;
  return out;
}
