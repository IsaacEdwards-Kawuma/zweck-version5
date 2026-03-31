/**
 * Transaction types for Post Transaction / Ledger — aligned with server `TxType` and `TX_ACCOUNT_MAP`.
 */

export const TX_TYPE_GROUPS = [
  {
    label: "Capital & Equity",
    options: [
      { value: "CONTRIBUTION", label: "Director Capital Contribution" },
      { value: "CONTRIBUTION_ARREARS", label: "Contribution in Arrears" },
      { value: "SUPPLEMENTARY_CAPITAL_CONTRIBUTION", label: "Supplementary Capital Contribution" },
      { value: "CAPITAL_WITHDRAWAL", label: "Capital Withdrawal / Distribution" },
      { value: "SIDE_FUND", label: "Side fund contributions" },
      { value: "RETAINED_EARNINGS_TRANSFER", label: "Retained earnings → director capital (split)" }
    ]
  },
  {
    label: "Revenue & Income",
    options: [
      { value: "MMF_RETURN", label: "Investment Returns (MMF / project return)" },
      { value: "INVESTMENT_RETURN", label: "Investment Returns (general)" },
      { value: "PROJECT_REVENUE", label: "Project Revenue" },
      { value: "INTEREST_INCOME", label: "Interest Income" },
      { value: "DIVIDEND_INCOME", label: "Dividend Income" },
      { value: "RENTAL_INCOME", label: "Rental Income" },
      { value: "OTHER_INCOME", label: "Other Income" },
      { value: "PENALTY", label: "Penalty & surcharges (income)" }
    ]
  },
  {
    label: "Project & Investment Activity",
    options: [
      { value: "MMF_DEPLOY", label: "MMF deploy (to investment)" },
      { value: "YPA_INVEST", label: "YPA / project invest" },
      { value: "PROJECT_DISBURSEMENT", label: "Project Disbursement" },
      { value: "ASSET_PURCHASE", label: "Asset Purchase" },
      { value: "LOAN_ADVANCED", label: "Loan Advanced (company lends principal)" },
      { value: "LOAN_REPAYMENT_RECEIVED", label: "Loan Repayment Received" }
    ]
  },
  {
    label: "Operating Expenses",
    options: [
      { value: "TX_CHARGE", label: "Bank Charges & Fees" },
      { value: "REGISTRATION", label: "Registrations" },
      { value: "LEGAL", label: "Legal & Professional Fees" },
      { value: "TRANSPORT_TRAVEL", label: "Transport & Travel" },
      { value: "COMMUNICATION_INTERNET", label: "Communication & Internet" },
      { value: "OFFICE_ADMINISTRATION", label: "Office & Administration" },
      { value: "PRINTING_STATIONERY", label: "Printing & Stationery" },
      { value: "SALARIES_WAGES", label: "Salaries & Wages" },
      { value: "DIRECTOR_FEE_ALLOWANCE", label: "Director Fee / Allowance" },
      { value: "UTILITIES", label: "Utilities" },
      { value: "INSURANCE", label: "Insurance" },
      { value: "MEALS_ENTERTAINMENT", label: "Meals & Entertainment" },
      { value: "OTHER_OUT", label: "Miscellaneous Expense" }
    ]
  },
  {
    label: "Director & Intercompany",
    options: [
      { value: "DIRECTOR_LOAN_TO_COMPANY", label: "Director Loan to Company" },
      { value: "DIRECTOR_LOAN_REPAYMENT", label: "Director Loan Repayment" },
      { value: "DIRECTORS_DISCIPLINARY_LEVY", label: "Directors’ Disciplinary Levy (fine)" },
      { value: "COMPANY_LOAN_TO_DIRECTOR", label: "Company Loan to Director" },
      { value: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN", label: "Director Repayment of Company Loan" },
      { value: "LOAN_IN", label: "Loan Received (External)" },
      { value: "LOAN_REPAYMENT_EXTERNAL", label: "Loan Repayment (External)" }
    ]
  },
  {
    label: "Tax & Compliance",
    options: [
      { value: "WITHHOLDING_TAX", label: "Withholding Tax (WHT)" },
      { value: "VAT_PAYABLE", label: "VAT Payable" },
      { value: "CORPORATE_TAX_PROVISION", label: "Corporate Tax Provision" }
    ]
  },
  {
    label: "Transfers",
    options: [
      { value: "INTER_ACCOUNT_TRANSFER", label: "Inter-account transfer" },
      { value: "FOREIGN_EXCHANGE_GAIN", label: "Foreign Exchange — Gain" },
      { value: "FOREIGN_EXCHANGE_LOSS", label: "Foreign Exchange — Loss" }
    ]
  }
];

/** Flat map for filters, CSV, etc. */
export const TX_TYPE_LABELS = Object.fromEntries(
  TX_TYPE_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label]))
);

export function labelForTxType(type) {
  if (type == null || type === "") return "UNKNOWN";
  return TX_TYPE_LABELS[type] || String(type).replaceAll("_", " ");
}

/** Preview + director requirement ΓÇö must match server `TX_ACCOUNT_MAP`. */
export const TX_ACCOUNT_MAP = {
  CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
  CONTRIBUTION_ARREARS: { debit: "bank", credit: "capital", needsDirector: true },
  SUPPLEMENTARY_CAPITAL_CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
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
  RENTAL_INCOME: { debit: "bank", credit: "rental_income", needsDirector: false },
  OTHER_INCOME: { debit: "bank", credit: "income_other", needsDirector: false },
  PROJECT_DISBURSEMENT: { debit: "project_exp", credit: "bank", needsDirector: false },
  ASSET_PURCHASE: { debit: "capex", credit: "bank", needsDirector: false },
  LOAN_ADVANCED: { debit: "loan_receivable", credit: "bank", needsDirector: false },
  LOAN_REPAYMENT_RECEIVED: { debit: "bank", credit: "loan_receivable", needsDirector: false },
  TRANSPORT_TRAVEL: { debit: "exp_transport", credit: "bank", needsDirector: false },
  COMMUNICATION_INTERNET: { debit: "exp_communication", credit: "bank", needsDirector: false },
  OFFICE_ADMINISTRATION: { debit: "exp_office", credit: "bank", needsDirector: false },
  PRINTING_STATIONERY: { debit: "exp_printing", credit: "bank", needsDirector: false },
  SALARIES_WAGES: { debit: "exp_salaries", credit: "bank", needsDirector: false },
  DIRECTOR_FEE_ALLOWANCE: { debit: "exp_salaries", credit: "bank", needsDirector: true },
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
  INTER_ACCOUNT_TRANSFER: { debit: "bank", credit: "bank", needsDirector: false },
  RETAINED_EARNINGS_TRANSFER: { debit: "retained_earnings", credit: "capital", needsDirector: false }
};

export const ALL_TX_TYPE_VALUES = Object.keys(TX_ACCOUNT_MAP);

/** Posting bucket per type (Income / Expense / Other). */
export const TX_POSTING_CATEGORY = {
  CONTRIBUTION: "OTHER",
  CONTRIBUTION_ARREARS: "OTHER",
  SUPPLEMENTARY_CAPITAL_CONTRIBUTION: "OTHER",
  CAPITAL_WITHDRAWAL: "OTHER",
  SIDE_FUND: "OTHER",
  MMF_DEPLOY: "OTHER",
  MMF_RETURN: "INCOME",
  YPA_INVEST: "OTHER",
  REGISTRATION: "EXPENSE",
  TX_CHARGE: "EXPENSE",
  LEGAL: "EXPENSE",
  PENALTY: "INCOME",
  LOAN_IN: "OTHER",
  OTHER_OUT: "EXPENSE",
  INVESTMENT_RETURN: "INCOME",
  PROJECT_REVENUE: "INCOME",
  INTEREST_INCOME: "INCOME",
  DIVIDEND_INCOME: "INCOME",
  RENTAL_INCOME: "INCOME",
  OTHER_INCOME: "INCOME",
  PROJECT_DISBURSEMENT: "EXPENSE",
  ASSET_PURCHASE: "EXPENSE",
  LOAN_REPAYMENT_RECEIVED: "OTHER",
  LOAN_ADVANCED: "OTHER",
  TRANSPORT_TRAVEL: "EXPENSE",
  COMMUNICATION_INTERNET: "EXPENSE",
  OFFICE_ADMINISTRATION: "EXPENSE",
  PRINTING_STATIONERY: "EXPENSE",
  SALARIES_WAGES: "EXPENSE",
  DIRECTOR_FEE_ALLOWANCE: "EXPENSE",
  UTILITIES: "EXPENSE",
  INSURANCE: "EXPENSE",
  MEALS_ENTERTAINMENT: "EXPENSE",
  DIRECTOR_LOAN_TO_COMPANY: "OTHER",
  DIRECTOR_LOAN_REPAYMENT: "OTHER",
  DIRECTORS_DISCIPLINARY_LEVY: "OTHER",
  COMPANY_LOAN_TO_DIRECTOR: "OTHER",
  DIRECTOR_REPAYMENT_OF_COMPANY_LOAN: "OTHER",
  LOAN_REPAYMENT_EXTERNAL: "OTHER",
  WITHHOLDING_TAX: "EXPENSE",
  VAT_PAYABLE: "EXPENSE",
  CORPORATE_TAX_PROVISION: "EXPENSE",
  FOREIGN_EXCHANGE_GAIN: "INCOME",
  FOREIGN_EXCHANGE_LOSS: "EXPENSE",
  INTER_ACCOUNT_TRANSFER: "OTHER",
  RETAINED_EARNINGS_TRANSFER: "OTHER"
};

export function needsProjectForType(type) {
  return type === "PROJECT_REVENUE" || type === "PROJECT_DISBURSEMENT";
}

export function isExpenseBucketType(type) {
  return TX_POSTING_CATEGORY[type] === "EXPENSE";
}

/** @type {{ value: string, label: string }[]} */
export const POSTING_BUCKET_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "OTHER", label: "Other (capital, loans, transfers)" }
];

/**
 * Accounts allowed for inter-account transfer (must match server).
 */
export const INTER_ACCOUNT_TRANSFER_OPTIONS = [
  { value: "bank_ugx", label: "1200 Cash at Bank (UGX)" },
  { value: "bank_usd", label: "1210 Cash at Bank (USD)" },
  { value: "bank_eur", label: "1220 Cash at Bank (EUR)" },
  { value: "cash_hand", label: "1100 Cash in Hand" },
  { value: "investments_general", label: "1500 Investments — General" },
  { value: "mmf", label: "1510 MMF Investment" },
  { value: "ypa", label: "1520 YPA Goats Project" },
  { value: "accounts_receivable", label: "1300 Accounts Receivable" },
  { value: "loan_receivable", label: "1400 Loans Extended" },
  { value: "director_loans_receivable", label: "1410 Director Loans Receivable" },
  { value: "capex", label: "1600 Fixed Assets" },
  { value: "other_assets", label: "1700 Other Assets" },
  { value: "accounts_payable", label: "2100 Accounts Payable" },
  { value: "loan_liability", label: "2200 Loans Payable (External)" },
  { value: "director_loan_to_company", label: "2300 Director Loans to Company" },
  { value: "tax_vat", label: "2400 VAT Payable" },
  { value: "tax_wht", label: "2500 Withholding Tax Payable" },
  { value: "tax_corporate", label: "2600 Other Liabilities" },
  { value: "capital", label: "3100 Director Capital (header)" },
  { value: "directors_capital_distributions_clearing", label: "3160 Directors’ Capital Distributions Clearing" },
  { value: "side_fund", label: "3200 Side Fund" },
  { value: "retained_earnings", label: "3300 Retained Earnings" }
];

/** P&L and other GL lines for manual posting (must stay aligned with server `ACCOUNTS`). */
const MANUAL_GL_EXTRA_OPTIONS = [
  { value: "mmf_income", label: "4100 Investment returns (income)" },
  { value: "income_investment", label: "4100 Investment income (general)" },
  { value: "income_project", label: "4200 Project revenue" },
  { value: "income_interest", label: "4300 Interest income" },
  { value: "income_dividend", label: "4400 Dividend income" },
  { value: "rental_income", label: "4500 Rental income" },
  { value: "income_other_4290", label: "4290 Other income (fines)" },
  { value: "income_other", label: "4900 Other income" },
  { value: "penalties", label: "4900 Penalties & surcharges" },
  { value: "income_fx", label: "4900 Foreign exchange gain" },
  { value: "reg_costs", label: "5100 Registrations (expense)" },
  { value: "tx_charge", label: "5100 Bank charges & fees" },
  { value: "legal", label: "5200 Legal & professional" },
  { value: "exp_transport", label: "5300 Transport & travel" },
  { value: "exp_communication", label: "5400 Communication & internet" },
  { value: "exp_office", label: "5500 Office & administration" },
  { value: "exp_printing", label: "5600 Printing & stationery" },
  { value: "exp_salaries", label: "5700 Salaries & wages" },
  { value: "exp_utilities", label: "5800 Utilities" },
  { value: "exp_insurance", label: "5900 Insurance" },
  { value: "exp_meals", label: "5910 Meals & entertainment" },
  { value: "project_exp", label: "5920 Project disbursements" },
  { value: "other_exp", label: "5990 Miscellaneous expense" },
  { value: "exp_fx", label: "5990 Foreign exchange loss" }
];

/**
 * @param {{ id: number, name?: string }[]} directors
 * @returns {{ value: string, label: string }[]}
 */
export function buildManualGlAccountOptions(directors = []) {
  const seen = new Set();
  const out = [];
  for (const o of INTER_ACCOUNT_TRANSFER_OPTIONS) {
    seen.add(o.value);
    out.push({ ...o });
  }
  for (const o of MANUAL_GL_EXTRA_OPTIONS) {
    if (!seen.has(o.value)) {
      seen.add(o.value);
      out.push({ ...o });
    }
  }
  for (const d of directors) {
    out.push(
      { value: `director_capital_${d.id}`, label: `311x Director capital — ${d.name}` },
      { value: `director_side_fund_${d.id}`, label: `3200 Side fund — ${d.name}` }
    );
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Suggested concrete GL keys for the selected type (matches server automation intent).
 * @param {string} type
 * @param {string} currency
 * @param {string} [directorId]
 * @param {{ paymentAp?: boolean, transferFrom?: string, transferTo?: string }} [opts]
 */
export function defaultManualKeysFromType(type, currency, directorId, opts = {}) {
  const { paymentAp = false, transferFrom = "", transferTo = "" } = opts;
  const map = TX_ACCOUNT_MAP[type];
  const bankKey = currency === "UGX" ? "bank_ugx" : currency === "USD" ? "bank_usd" : "bank_eur";
  const dirNum = directorId ? Number(directorId) : NaN;
  if (!map) return { debit: bankKey, credit: "other_exp" };
  if (type === "INTER_ACCOUNT_TRANSFER") {
    const debit = transferTo ? (transferTo === "bank" ? bankKey : transferTo) : bankKey;
    const credit = transferFrom ? (transferFrom === "bank" ? bankKey : transferFrom) : bankKey;
    return { debit, credit };
  }
  function resolve(k) {
    if (k === "bank") return bankKey;
    if (k === "capital" && Number.isFinite(dirNum)) return `director_capital_${dirNum}`;
    if (k === "capital") return "capital";
    if (k === "side_fund" && Number.isFinite(dirNum)) return `director_side_fund_${dirNum}`;
    if (k === "side_fund") return "side_fund";
    return k;
  }
  let debit = resolve(map.debit);
  let credit = resolve(map.credit);
  if (TX_POSTING_CATEGORY[type] === "EXPENSE" && paymentAp && map.credit === "bank") {
    credit = "accounts_payable";
  }
  return { debit, credit };
}

/**
 * @param {string} bucket ALL | INCOME | EXPENSE | OTHER
 */
export function filterTxTypeGroupsForBucket(bucket) {
  if (bucket === "ALL") return TX_TYPE_GROUPS;
  return TX_TYPE_GROUPS.map((g) => ({
    ...g,
    options: g.options.filter((o) => TX_POSTING_CATEGORY[o.value] === bucket)
  })).filter((g) => g.options.length > 0);
}

/**
 * @param {string} bucket
 * @returns {string|undefined} first tx type value in bucket, or undefined
 */
export function firstTxTypeInBucket(bucket) {
  const groups = filterTxTypeGroupsForBucket(bucket);
  const first = groups[0]?.options[0];
  return first?.value;
}

/** Ledger / statement filters: bank by currency, equity, and common GL lines. */
export const LEDGER_ACCOUNT_FILTER_OPTIONS = [
  { value: "bank_ugx", label: "1200 Cash at Bank (UGX)" },
  { value: "bank_usd", label: "1210 Cash at Bank (USD)" },
  { value: "bank_eur", label: "1220 Cash at Bank (EUR)" },
  { value: "capital", label: "Director capital (all directors)" },
  { value: "side_fund", label: "Side fund (all directors)" },
  { value: "mmf", label: "1510 MMF Investment" },
  { value: "ypa", label: "1520 YPA Goats Project" },
  { value: "mmf_income", label: "4100 Investment returns (income)" },
  { value: "income_project", label: "4200 Project revenue" },
  { value: "project_exp", label: "5920 Project disbursements" },
  { value: "exp_transport", label: "5300 Transport & Travel" },
  { value: "tx_charge", label: "5100 Bank charges & fees" },
  { value: "other_exp", label: "5990 Miscellaneous expense" }
];
