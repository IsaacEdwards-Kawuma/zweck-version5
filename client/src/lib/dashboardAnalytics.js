/** @typedef {{ date: string, amount: number, type: string, director?: { id: number, name: string } | null }} TxRow */

function monthKeyFromDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelFromMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * Last N calendar months (from the start of month N-1 ago through current month bucket).
 * @param {number} monthsBack
 * @returns {string[]} keys like "2025-03"
 */
export function rollingMonthKeys(monthsBack = 12) {
  const out = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * @param {TxRow[]} transactions
 * @param {number} monthsBack
 */
export function monthlyVolumeSeries(transactions, monthsBack = 12) {
  const keys = rollingMonthKeys(monthsBack);
  const map = new Map(keys.map((k) => [k, { amount: 0, count: 0 }]));
  for (const t of transactions) {
    const k = monthKeyFromDate(t.date);
    if (!k || !map.has(k)) continue;
    const b = map.get(k);
    b.amount += Number(t.amount) || 0;
    b.count += 1;
  }
  return keys.map((month) => ({
    month,
    label: labelFromMonthKey(month),
    amount: map.get(month).amount,
    count: map.get(month).count
  }));
}

export const TX_TYPE_LABELS = {
  CONTRIBUTION: "Contribution",
  SIDE_FUND: "Side fund",
  MMF_DEPLOY: "MMF deploy",
  MMF_RETURN: "MMF return",
  YPA_INVEST: "YPA invest",
  REGISTRATION: "Registration",
  TX_CHARGE: "TX charge",
  LEGAL: "Legal",
  PENALTY: "Penalty",
  LOAN_IN: "Loan in",
  OTHER_OUT: "Other out"
};

/**
 * @param {TxRow[]} transactions
 */
export function volumeByType(transactions) {
  const map = new Map();
  for (const t of transactions) {
    const ty = t.type || "UNKNOWN";
    map.set(ty, (map.get(ty) || 0) + (Number(t.amount) || 0));
  }
  const rows = Array.from(map.entries())
    .map(([type, amount]) => ({
      type,
      name: TX_TYPE_LABELS[type] || type,
      amount
    }))
    .sort((a, b) => b.amount - a.amount);
  return rows;
}

/**
 * Sum CONTRIBUTION + SIDE_FUND per director (capital inflow view).
 * @param {TxRow[]} transactions
 */
export function directorInflowTotals(transactions) {
  const map = new Map();
  for (const t of transactions) {
    if (t.type !== "CONTRIBUTION" && t.type !== "SIDE_FUND") continue;
    const dir = t.director;
    if (!dir?.id) continue;
    const key = dir.id;
    const prev = map.get(key) || { id: dir.id, name: dir.name, amount: 0 };
    prev.amount += Number(t.amount) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

/**
 * @param {TxRow[]} transactions
 */
export function periodComparison30d(transactions) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const end = now;
  const startLast = now - 30 * day;
  const startPrev = now - 60 * day;
  const endPrev = now - 30 * day;

  let last30 = { count: 0, volume: 0 };
  let prev30 = { count: 0, volume: 0 };

  for (const t of transactions) {
    const ts = new Date(t.date).getTime();
    if (Number.isNaN(ts)) continue;
    const amt = Number(t.amount) || 0;
    if (ts >= startLast && ts <= end) {
      last30.count += 1;
      last30.volume += amt;
    } else if (ts >= startPrev && ts < endPrev) {
      prev30.count += 1;
      prev30.volume += amt;
    }
  }

  const pct = (a, b) => (b === 0 ? (a === 0 ? 0 : 100) : Math.round(((a - b) / b) * 1000) / 10);

  return {
    last30,
    prev30,
    countDeltaPct: pct(last30.count, prev30.count),
    volumeDeltaPct: pct(last30.volume, prev30.volume)
  };
}
