import { TX_TYPE_LABELS } from "./dashboardAnalytics";

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
    if (t.type === "CONTRIBUTION") row.contributions += t.amount;
    if (t.type === "MMF_RETURN" || t.type === "PENALTY" || t.type === "LOAN_IN") {
      row.income += t.amount;
    }
    if (
      t.type === "REGISTRATION" ||
      t.type === "TX_CHARGE" ||
      t.type === "LEGAL" ||
      t.type === "OTHER_OUT"
    ) {
      row.expenses += t.amount;
    }
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
    if (t.type === "CONTRIBUTION") contributions += a;
    if (t.type === "MMF_RETURN" || t.type === "PENALTY" || t.type === "LOAN_IN") income += a;
    if (
      t.type === "REGISTRATION" ||
      t.type === "TX_CHARGE" ||
      t.type === "LEGAL" ||
      t.type === "OTHER_OUT"
    ) {
      expenses += a;
    }
  }
  return { contributions, income, expenses, net: income - expenses };
}

/** Split amounts for pie charts: income-like vs expense-like transaction types. */
export function incomeExpenseMix(transactions) {
  const inc = {};
  const exp = {};
  for (const t of transactions) {
    const a = Number(t.amount) || 0;
    if (t.type === "MMF_RETURN" || t.type === "PENALTY" || t.type === "LOAN_IN") {
      inc[t.type] = (inc[t.type] || 0) + a;
    }
    if (
      t.type === "REGISTRATION" ||
      t.type === "TX_CHARGE" ||
      t.type === "LEGAL" ||
      t.type === "OTHER_OUT"
    ) {
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
  const lines = [["group", "key", "name", "balance_display_eur"].map(esc).join(",")];
  for (const g of groups) {
    for (const [key, meta] of Object.entries(accounts)) {
      if (meta.group !== g) continue;
      const bal = balances[key] || 0;
      const display = g === "Income" || g === "Equity" ? -bal : bal;
      lines.push([g, key, meta.name, String(display)].map(esc).join(","));
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
  const headers = ["date", "type", "amount", "director", "description"];
  const lines = [headers.join(",")];
  for (const t of transactions) {
    const row = [
      t.date,
      t.type,
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
