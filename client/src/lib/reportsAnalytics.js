import { TX_TYPE_LABELS } from "./transactionTypes";

/** Legacy Reports classification — keep in sync across aggregateReportByMonth, reportPeriodKpis, incomeExpenseMix. */
function isContributionType(type) {
  return type === "CONTRIBUTION";
}

const REPORT_INCOME_TYPES = new Set([
  "MMF_RETURN",
  "INVESTMENT_RETURN",
  "PROJECT_REVENUE",
  "INTEREST_INCOME",
  "DIVIDEND_INCOME",
  "OTHER_INCOME",
  "PENALTY",
  "LOAN_IN",
  "LOAN_REPAYMENT_RECEIVED",
  "FOREIGN_EXCHANGE_GAIN"
]);

const REPORT_EXPENSE_TYPES = new Set([
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
  "FOREIGN_EXCHANGE_LOSS"
]);

function isReportIncomeType(type) {
  return REPORT_INCOME_TYPES.has(type);
}

function isReportExpenseType(type) {
  return REPORT_EXPENSE_TYPES.has(type);
}

/**
 * @param {Array<{ date: string }>} transactions
 * @param {string} [fromStr] yyyy-mm-dd
 * @param {string} [toStr] yyyy-mm-dd
 */
export function filterByDateRange(transactions, fromStr, toStr) {
  if (!fromStr?.trim() && !toStr?.trim()) return transactions;
  return transactions.filter((t) => {
    const d = new Date(t.date).getTime();
    if (Number.isNaN(d)) return false;
    if (fromStr?.trim()) {
      const f = new Date(fromStr.trim() + "T00:00:00").getTime();
      if (d < f) return false;
    }
    if (toStr?.trim()) {
      const x = new Date(toStr.trim() + "T23:59:59.999").getTime();
      if (d > x) return false;
    }
    return true;
  });
}

/** Local calendar yyyy-mm-dd (matches HTML date inputs and filterByDateRange). */
export function isoDateOnly(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {Date} [now]
 * @returns {{ from: string, to: string }} Inclusive window: today and the prior 29 local days (30 days total).
 */
export function reportRangeLast30Days(now = new Date()) {
  const to = new Date(now);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: isoDateOnly(from), to: isoDateOnly(to) };
}

/** @param {Date} [now] */
export function reportRangeThisMonth(now = new Date()) {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: isoDateOnly(from), to: isoDateOnly(to) };
}

/** @param {Date} [now] */
export function reportRangeYtd(now = new Date()) {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), 0, 1);
  return { from: isoDateOnly(from), to: isoDateOnly(d) };
}

/**
 * KPIs for the rolling 30-day window (same rules as {@link reportRangeLast30Days}).
 * @param {Array<{ date: string, type: string, amount?: number }>} transactions
 * @param {Date} [now] Reference day (defaults to today); useful for tests.
 */
export function reportRolling30DayKpis(transactions, now = new Date()) {
  const r = reportRangeLast30Days(now);
  return reportPeriodKpis(filterByDateRange(transactions, r.from, r.to));
}

/** Same classification rules as the legacy Reports page. */
export function aggregateReportByMonth(transactions) {
  const mapMonth = new Map();
  for (const t of transactions) {
    const d = new Date(t.date);
    if (Number.isNaN(d.getTime())) continue;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let row = mapMonth.get(ym);
    if (!row) {
      row = { month: ym, income: 0, expenses: 0, contributions: 0 };
      mapMonth.set(ym, row);
    }
    const a = Number(t.amount) || 0;
    if (isContributionType(t.type)) row.contributions += a;
    if (isReportIncomeType(t.type)) row.income += a;
    if (isReportExpenseType(t.type)) row.expenses += a;
  }
  return Array.from(mapMonth.values()).sort((a, b) => (a.month > b.month ? 1 : -1));
}

export function aggregateByTypeTotals(transactions) {
  const mapType = new Map();
  for (const t of transactions) {
    mapType.set(t.type, (mapType.get(t.type) || 0) + (Number(t.amount) || 0));
  }
  return Array.from(mapType.entries())
    .map(([type, total]) => ({
      type,
      name: TX_TYPE_LABELS[type] || type,
      total
    }))
    .sort((a, b) => b.total - a.total);
}

export function reportPeriodKpis(transactions) {
  let contributions = 0;
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    const a = Number(t.amount) || 0;
    if (isContributionType(t.type)) contributions += a;
    if (isReportIncomeType(t.type)) income += a;
    if (isReportExpenseType(t.type)) expenses += a;
  }
  return { contributions, income, expenses, net: income - expenses };
}

/** Split amounts for pie charts: income-like vs expense-like transaction types. */
export function incomeExpenseMix(transactions) {
  const inc = {};
  const exp = {};
  for (const t of transactions) {
    const a = Number(t.amount) || 0;
    if (isReportIncomeType(t.type)) {
      inc[t.type] = (inc[t.type] || 0) + a;
    }
    if (isReportExpenseType(t.type)) {
      exp[t.type] = (exp[t.type] || 0) + a;
    }
  }
  const toArr = (o) =>
    Object.entries(o).map(([type, value]) => ({
      type,
      name: TX_TYPE_LABELS[type] || type,
      value
    }));
  return { incomeRows: toArr(inc), expenseRows: toArr(exp) };
}

export function downloadChartOfAccountsCsv(accounts, balances, groups, filename = "zweck-chart-of-accounts.csv") {
  if (!accounts || !balances) return;
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [["group", "code", "key", "name", "balance_display_eur"].map(esc).join(",")];
  for (const g of groups) {
    for (const [key, meta] of Object.entries(accounts)) {
      if (meta.group !== g) continue;
      const bal = balances[key] || 0;
      const display = g === "Income" || g === "Equity" ? -bal : bal;
      const code = meta.code != null ? String(meta.code) : "";
      lines.push([g, code, key, meta.name, String(display)].map(esc).join(","));
    }
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTransactionsCsv(transactions, filename = "zweck-transactions.csv") {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const headers = ["reference", "date", "type", "currency", "amount", "director", "description"];
  const lines = [headers.join(",")];
  for (const t of transactions) {
    const ref = t.reference || (t.id != null ? `ZWC-${String(t.id).padStart(7, "0")}` : "");
    const row = [
      ref,
      t.date,
      t.type,
      t.currency || "EUR",
      t.amount,
      t.director?.name || "",
      (t.description || "").replace(/\r?\n/g, " ")
    ];
    lines.push(row.map(esc).join(","));
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
