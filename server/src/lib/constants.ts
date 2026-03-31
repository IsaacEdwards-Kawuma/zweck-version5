import { TxType } from "@prisma/client";

export type AccountKey =
  | "bank"
  | "bank_ugx"
  | "bank_usd"
  | "bank_eur"
  | "cash_hand"
  | "mmf"
  | "ypa"
  | "investments_general"
  | "accounts_receivable"
  | "loan_receivable"
  | "director_loans_receivable"
  | "other_assets"
  | "loan_liability"
  | "accounts_payable"
  | "director_loan_to_company"
  | "capital"
  | "directors_capital_distributions_clearing"
  | "side_fund"
  | "retained_earnings"
  | "mmf_income"
  | "penalties"
  | "income_investment"
  | "income_project"
  | "income_interest"
  | "income_dividend"
  | "rental_income"
  | "income_other_4290"
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

export const ACCOUNTS: Record<
  AccountKey,
  { name: string; group: "Assets" | "Liabilities" | "Equity" | "Income" | "Expenses"; code: number }
> = {
  bank: { name: "Cash at Bank (All currencies)", group: "Assets", code: 1200 },
  bank_ugx: { name: "Cash at Bank (UGX)", group: "Assets", code: 1200 },
  bank_usd: { name: "Cash at Bank (USD)", group: "Assets", code: 1210 },
  bank_eur: { name: "Cash at Bank (EUR)", group: "Assets", code: 1220 },

  cash_hand: { name: "Cash in Hand", group: "Assets", code: 1100 },
  investments_general: { name: "Investments ΓÇö General", group: "Assets", code: 1500 },
  mmf: { name: "MMF Investment", group: "Assets", code: 1510 },
  ypa: { name: "YPA Goats Project", group: "Assets", code: 1520 },
  accounts_receivable: { name: "Accounts Receivable", group: "Assets", code: 1300 },
  loan_receivable: { name: "Loans Extended", group: "Assets", code: 1400 },
  director_loans_receivable: { name: "Director Loans Receivable", group: "Assets", code: 1410 },
  capex: { name: "Fixed Assets", group: "Assets", code: 1600 },
  other_assets: { name: "Other Assets", group: "Assets", code: 1700 },

  accounts_payable: { name: "Accounts Payable", group: "Liabilities", code: 2100 },
  loan_liability: { name: "Loans Payable (External)", group: "Liabilities", code: 2200 },
  director_loan_to_company: { name: "Director Loans to Company", group: "Liabilities", code: 2300 },
  tax_vat: { name: "VAT Payable", group: "Liabilities", code: 2400 },
  tax_wht: { name: "Withholding Tax Payable", group: "Liabilities", code: 2500 },
  tax_corporate: { name: "Other Liabilities", group: "Liabilities", code: 2600 },

  /** Equity header ΓÇö no postings; director lines use 3110ΓÇô3150 in COA. */
  capital: { name: "Director Capital (header ΓÇö no postings)", group: "Equity", code: 3100 },
  directors_capital_distributions_clearing: {
    name: "Directors’ Capital Distributions / Withdrawals Clearing",
    group: "Equity",
    code: 3160
  },
  side_fund: { name: "Side Fund", group: "Equity", code: 3200 },
  retained_earnings: { name: "Retained Earnings", group: "Equity", code: 3300 },

  // Income
  mmf_income: { name: "Investment Returns", group: "Income", code: 4100 },
  income_investment: { name: "Investment Returns", group: "Income", code: 4100 },
  income_project: { name: "Project Revenue", group: "Income", code: 4200 },
  income_interest: { name: "Interest Income", group: "Income", code: 4300 },
  income_dividend: { name: "Dividend Income", group: "Income", code: 4400 },
  rental_income: { name: "Rental Income", group: "Income", code: 4500 },
  income_other_4290: { name: "Other Income", group: "Income", code: 4290 },
  income_other: { name: "Other Income", group: "Income", code: 4900 },
  penalties: { name: "Other Income", group: "Income", code: 4900 },
  income_fx: { name: "Other Income", group: "Income", code: 4900 },

  // Expenses
  reg_costs: { name: "Bank Charges & Fees", group: "Expenses", code: 5100 },
  tx_charge: { name: "Bank Charges & Fees", group: "Expenses", code: 5100 },
  legal: { name: "Legal & Professional Fees", group: "Expenses", code: 5200 },
  exp_transport: { name: "Transport & Travel", group: "Expenses", code: 5300 },
  exp_communication: { name: "Communication & Internet", group: "Expenses", code: 5400 },
  exp_office: { name: "Office & Administration", group: "Expenses", code: 5500 },
  exp_printing: { name: "Printing & Stationery", group: "Expenses", code: 5600 },
  exp_salaries: { name: "Salaries & Wages", group: "Expenses", code: 5700 },
  exp_utilities: { name: "Utilities", group: "Expenses", code: 5800 },
  exp_insurance: { name: "Insurance", group: "Expenses", code: 5900 },
  exp_meals: { name: "Meals & Entertainment", group: "Expenses", code: 5910 },
  project_exp: { name: "Project Disbursements", group: "Expenses", code: 5920 },
  other_exp: { name: "Miscellaneous Expense", group: "Expenses", code: 5990 },
  exp_fx: { name: "Miscellaneous Expense", group: "Expenses", code: 5990 }
};

/** Account keys allowed for inter-account transfers (no aggregate `bank`). */
export const INTER_ACCOUNT_TRANSFER_KEYS: AccountKey[] = [
  "bank_ugx",
  "bank_usd",
  "bank_eur",
  "cash_hand",
  "mmf",
  "ypa",
  "investments_general",
  "accounts_receivable",
  "loan_receivable",
  "director_loans_receivable",
  "capex",
  "other_assets",
  "accounts_payable",
  "loan_liability",
  "director_loan_to_company",
  "tax_vat",
  "tax_wht",
  "tax_corporate",
  "capital",
  "directors_capital_distributions_clearing",
  "side_fund",
  "retained_earnings"
];

const EXPENSE_TYPES: TxType[] = [
  "REGISTRATION",
  "TX_CHARGE",
  "LEGAL",
  "OTHER_OUT",
  "PROJECT_DISBURSEMENT",
  "ASSET_PURCHASE",
  "TRANSPORT_TRAVEL",
  "COMMUNICATION_INTERNET",
  "OFFICE_ADMINISTRATION",
  "PRINTING_STATIONERY",
  "SALARIES_WAGES",
  "UTILITIES",
  "INSURANCE",
  "MEALS_ENTERTAINMENT",
  "WITHHOLDING_TAX",
  "VAT_PAYABLE",
  "CORPORATE_TAX_PROVISION",
  "FOREIGN_EXCHANGE_LOSS",
  "DIRECTOR_FEE_ALLOWANCE"
];

export function isExpenseTxType(t: TxType): boolean {
  return EXPENSE_TYPES.includes(t);
}

export const TX_ACCOUNT_MAP: Record<
  TxType,
  { debit: AccountKey; credit: AccountKey; needsDirector: boolean }
> = {
  CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
  CONTRIBUTION_ARREARS: { debit: "bank", credit: "capital", needsDirector: true },
  SUPPLEMENTARY_CAPITAL_CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
  CAPITAL_WITHDRAWAL: { debit: "capital", credit: "bank", needsDirector: true },
  DIRECTORS_CAPITAL_DISTRIBUTION: { debit: "capital", credit: "bank", needsDirector: true },
  CAPITAL_REINSTATEMENT: { debit: "bank", credit: "capital", needsDirector: true },
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
  RENTAL_INCOME: { debit: "bank", credit: "rental_income", needsDirector: false },
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
  DIRECTOR_LOAN_TO_COMPANY: { debit: "bank", credit: "director_loan_to_company", needsDirector: true },
  DIRECTOR_LOAN_REPAYMENT: { debit: "director_loan_to_company", credit: "bank", needsDirector: true },
  DIRECTORS_DISCIPLINARY_LEVY: { debit: "capital", credit: "income_other_4290", needsDirector: true },
  COMPANY_LOAN_TO_DIRECTOR: { debit: "director_loans_receivable", credit: "side_fund", needsDirector: true },
  DIRECTOR_REPAYMENT_OF_COMPANY_LOAN: { debit: "bank", credit: "side_fund", needsDirector: true },
  LOAN_REPAYMENT_EXTERNAL: { debit: "loan_liability", credit: "bank", needsDirector: false },
  WITHHOLDING_TAX: { debit: "tax_wht", credit: "bank", needsDirector: false },
  VAT_PAYABLE: { debit: "tax_vat", credit: "bank", needsDirector: false },
  CORPORATE_TAX_PROVISION: { debit: "tax_corporate", credit: "bank", needsDirector: false },
  FOREIGN_EXCHANGE_GAIN: { debit: "bank", credit: "income_fx", needsDirector: false },
  FOREIGN_EXCHANGE_LOSS: { debit: "exp_fx", credit: "bank", needsDirector: false },
  DIRECTOR_FEE_ALLOWANCE: { debit: "exp_salaries", credit: "bank", needsDirector: true },
  INTER_ACCOUNT_TRANSFER: { debit: "bank", credit: "bank", needsDirector: false },
  /** Server splits amount across up to five directors; directorId on each line is set automatically. */
  RETAINED_EARNINGS_TRANSFER: { debit: "retained_earnings", credit: "capital", needsDirector: false }
};

export function emptyBalances(): Record<AccountKey, number> {
  const out = {} as Record<AccountKey, number>;
  for (const k of Object.keys(ACCOUNTS) as AccountKey[]) out[k] = 0;
  return out;
}
