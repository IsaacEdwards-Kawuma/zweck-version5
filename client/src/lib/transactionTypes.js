/**
 * Transaction types for Post Transaction / Ledger — aligned with server `TxType` and `TX_ACCOUNT_MAP`.
 * Group labels match the chart used in operations.
 */

export const TX_TYPE_GROUPS = [
  {
    label: "Capital & Equity",
    options: [
      { value: "CONTRIBUTION", label: "1. Director Capital Contribution" },
      { value: "CAPITAL_WITHDRAWAL", label: "2. Capital Withdrawal / Distribution" },
      { value: "SIDE_FUND", label: "3. Side fund contributions" }
    ]
  },
  {
    label: "Revenue & Income",
    options: [
      { value: "MMF_RETURN", label: "4. Investment Returns (MMF / project return)" },
      { value: "INVESTMENT_RETURN", label: "4b. Investment Returns (general)" },
      { value: "PROJECT_REVENUE", label: "5. Project Revenue" },
      { value: "INTEREST_INCOME", label: "6. Interest Income" },
      { value: "DIVIDEND_INCOME", label: "7. Dividend Income" },
      { value: "OTHER_INCOME", label: "9. Other Income" },
      { value: "PENALTY", label: "Penalty & surcharges (income)" }
    ]
  },
  {
    label: "Project & Investment Activity",
    options: [
      { value: "MMF_DEPLOY", label: "MMF deploy (to investment)" },
      { value: "YPA_INVEST", label: "YPA / project invest" },
      { value: "PROJECT_DISBURSEMENT", label: "10. Project Disbursement" },
      { value: "ASSET_PURCHASE", label: "11. Asset Purchase" },
      { value: "LOAN_ADVANCED", label: "12. Loan Advanced (company lends principal)" },
      { value: "LOAN_REPAYMENT_RECEIVED", label: "14. Loan Repayment Received" }
    ]
  },
  {
    label: "Operating Expenses",
    options: [
      { value: "TX_CHARGE", label: "15. Bank Charges & Fees" },
      { value: "REGISTRATION", label: "16. Registrations" },
      { value: "LEGAL", label: "16. Legal & Professional Fees" },
      { value: "TRANSPORT_TRAVEL", label: "17. Transport & Travel" },
      { value: "COMMUNICATION_INTERNET", label: "18. Communication & Internet" },
      { value: "OFFICE_ADMINISTRATION", label: "19. Office & Administration" },
      { value: "PRINTING_STATIONERY", label: "20. Printing & Stationery" },
      { value: "SALARIES_WAGES", label: "21. Salaries & Wages" },
      { value: "UTILITIES", label: "22. Utilities" },
      { value: "INSURANCE", label: "23. Insurance" },
      { value: "MEALS_ENTERTAINMENT", label: "24. Meals & Entertainment" },
      { value: "OTHER_OUT", label: "25. Miscellaneous Expense" }
    ]
  },
  {
    label: "Director & Intercompany",
    options: [
      { value: "DIRECTOR_LOAN_TO_COMPANY", label: "26. Director Loan to Company" },
      { value: "DIRECTOR_LOAN_REPAYMENT", label: "27. Director Loan Repayment" },
      { value: "LOAN_IN", label: "29. Loan Received (External)" },
      { value: "LOAN_REPAYMENT_EXTERNAL", label: "30. Loan Repayment (External)" }
    ]
  },
  {
    label: "Tax & Compliance",
    options: [
      { value: "WITHHOLDING_TAX", label: "31. Withholding Tax (WHT)" },
      { value: "VAT_PAYABLE", label: "32. VAT Payable" },
      { value: "CORPORATE_TAX_PROVISION", label: "33. Corporate Tax Provision" }
    ]
  },
  {
    label: "Transfers",
    options: [
      { value: "FOREIGN_EXCHANGE_GAIN", label: "35. Foreign Exchange — Gain" },
      { value: "FOREIGN_EXCHANGE_LOSS", label: "35. Foreign Exchange — Loss" }
    ]
  }
];

/** Flat map for filters, CSV, etc. */
export const TX_TYPE_LABELS = Object.fromEntries(
  TX_TYPE_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label]))
);

/** Display label for a transaction type (keeps chart code from depending on TX_TYPE_LABELS binding in other modules). */
export function labelForTxType(type) {
  if (type == null || type === "") return "UNKNOWN";
  return TX_TYPE_LABELS[type] || String(type).replaceAll("_", " ");
}

/** Preview + director requirement — must match server `TX_ACCOUNT_MAP`. */
export const TX_ACCOUNT_MAP = {
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
  LOAN_ADVANCED: { debit: "loan_receivable", credit: "bank", needsDirector: false },
  LOAN_REPAYMENT_RECEIVED: { debit: "bank", credit: "loan_receivable", needsDirector: false },
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

export const ALL_TX_TYPE_VALUES = Object.keys(TX_ACCOUNT_MAP);

/**
 * Post Transaction first-level filter (Income / Expense / Other).
 * OTHER = capital, equity moves, loans, inter-account transfers, balance-sheet items.
 */
export const TX_POSTING_CATEGORY = {
  CONTRIBUTION: "OTHER",
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
  UTILITIES: "EXPENSE",
  INSURANCE: "EXPENSE",
  MEALS_ENTERTAINMENT: "EXPENSE",
  DIRECTOR_LOAN_TO_COMPANY: "OTHER",
  DIRECTOR_LOAN_REPAYMENT: "OTHER",
  LOAN_REPAYMENT_EXTERNAL: "OTHER",
  WITHHOLDING_TAX: "EXPENSE",
  VAT_PAYABLE: "EXPENSE",
  CORPORATE_TAX_PROVISION: "EXPENSE",
  FOREIGN_EXCHANGE_GAIN: "INCOME",
  FOREIGN_EXCHANGE_LOSS: "EXPENSE"
};

/** @type {{ value: string, label: string }[]} */
export const POSTING_BUCKET_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "OTHER", label: "Other (capital, loans, transfers)" }
];

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
