import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { deriveBalances } from "../lib/derive.js";
import { apiError } from "../lib/http.js";
import { ACCOUNTS } from "../lib/constants.js";

const router = Router();

function withEquityShareFromContribution<T extends { capital: number }>(rows: T[]) {
  const totalContribution = rows.reduce((s, r) => s + (Number(r.capital) || 0), 0);
  return rows.map((r) => ({
    ...r,
    equitySharePct: totalContribution > 0 ? Math.round(((r.capital / totalContribution) * 100) * 100) / 100 : 0
  }));
}

router.get("/balances", async (_req, res) => {
  const txs = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      currency: true,
      directorId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true,
      reversalOfId: true,
      postingStatus: true
    }
  });
  const balances = deriveBalances(txs as any);
  return res.json(balances);
});

router.get("/director/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const director = await prisma.director.findUnique({
    where: { id },
    select: { id: true, name: true, initials: true, email: true, avatarUrl: true }
  });
  if (!director) return res.status(404).json(apiError("Director not found"));

  const txs = await prisma.transaction.findMany({
    where: { directorId: id, type: { in: ["CONTRIBUTION", "SIDE_FUND"] } },
    select: { type: true, amount: true }
  });

  let capital = 0;
  let sideFund = 0;
  for (const t of txs) {
    if (t.type === "CONTRIBUTION") capital += t.amount;
    if (t.type === "SIDE_FUND") sideFund += t.amount;
  }
  const totalContribution = await prisma.transaction.aggregate({
    where: { type: "CONTRIBUTION", directorId: { not: null } },
    _sum: { amount: true }
  });
  const contributionBase = Number(totalContribution._sum.amount || 0);
  const equitySharePct = contributionBase > 0 ? Math.round(((capital / contributionBase) * 100) * 100) / 100 : 0;
  return res.json({ director, capital, sideFund, total: capital + sideFund, equitySharePct });
});

router.get("/directors/all", async (_req, res) => {
  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, initials: true, email: true, active: true, avatarUrl: true, createdAt: true }
  });

  const txs = await prisma.transaction.findMany({
    where: { directorId: { not: null }, type: { in: ["CONTRIBUTION", "SIDE_FUND"] } },
    select: { directorId: true, type: true, amount: true }
  });

  const totals = new Map<number, { capital: number; sideFund: number }>();
  for (const d of directors) totals.set(d.id, { capital: 0, sideFund: 0 });
  for (const t of txs) {
    if (!t.directorId) continue;
    const cur = totals.get(t.directorId) ?? { capital: 0, sideFund: 0 };
    if (t.type === "CONTRIBUTION") cur.capital += t.amount;
    if (t.type === "SIDE_FUND") cur.sideFund += t.amount;
    totals.set(t.directorId, cur);
  }

  const outRaw = directors.map((d) => {
    const t = totals.get(d.id) ?? { capital: 0, sideFund: 0 };
    return { ...d, capital: t.capital, sideFund: t.sideFund, total: t.capital + t.sideFund };
  });
  const out = withEquityShareFromContribution(outRaw);

  return res.json(out);
});

// Alias used by Vercel deployments where multi-segment `/api/...` proxying can fail.
// The dashboard calls `/api/accounts/directors` (2 segments after `/api`) instead of
// `/api/accounts/directors/all` (3 segments after `/api`).
router.get("/directors", async (_req, res) => {
  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, initials: true, email: true, active: true, avatarUrl: true, createdAt: true }
  });

  const txs = await prisma.transaction.findMany({
    where: { directorId: { not: null }, type: { in: ["CONTRIBUTION", "SIDE_FUND"] } },
    select: { directorId: true, type: true, amount: true }
  });

  const totals = new Map<number, { capital: number; sideFund: number }>();
  for (const d of directors) totals.set(d.id, { capital: 0, sideFund: 0 });
  for (const t of txs) {
    if (!t.directorId) continue;
    const cur = totals.get(t.directorId) ?? { capital: 0, sideFund: 0 };
    if (t.type === "CONTRIBUTION") cur.capital += t.amount;
    if (t.type === "SIDE_FUND") cur.sideFund += t.amount;
    totals.set(t.directorId, cur);
  }

  const outRaw = directors.map((d) => {
    const t = totals.get(d.id) ?? { capital: 0, sideFund: 0 };
    return { ...d, capital: t.capital, sideFund: t.sideFund, total: t.capital + t.sideFund };
  });
  const out = withEquityShareFromContribution(outRaw);

  return res.json(out);
});

router.get("/summary", async (_req, res) => {
  const txs = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      currency: true,
      directorId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true,
      reversalOfId: true,
      postingStatus: true
    }
  });

  // Base balances from the ledger mapping (keeps existing dashboard/analytics semantics).
  const balancesBase = deriveBalances(txs as any);

  // COA adds two dynamic account families on top:
  // 1) cash at bank split by currency (1200/1210/1220)
  // 2) director-specific capital accounts under Equity (3100/3110/...)
  const directorRows = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true }
  });

  const accountsForCOA: Record<string, { name: string; group: "Assets" | "Liabilities" | "Equity" | "Income" | "Expenses"; code: number }> =
    { ...ACCOUNTS } as any;

  // COA should use the standardized currency-split bank accounts and director-specific capital accounts.
  delete accountsForCOA.bank;
  delete accountsForCOA.capital;

  const balancesForCOA: Record<string, number> = { ...(balancesBase as any) };

  // Sign convention: liabilities/equity are displayed with flipped sign in the UI.
  // Tax-related tx types currently post to these accounts as debits; flip them here
  // so the COA shows these standard payable accounts correctly under Liabilities.
  balancesForCOA.tax_vat = -(Number(balancesForCOA.tax_vat) || 0);
  balancesForCOA.tax_wht = -(Number(balancesForCOA.tax_wht) || 0);
  balancesForCOA.tax_corporate = -(Number(balancesForCOA.tax_corporate) || 0);

  // 3100 = header (no postings). Director lines: 3110, 3120, … 3150 for first five directors by creation order.
  accountsForCOA.director_capital_header = {
    name: "Director Capital (header — no postings)",
    group: "Equity",
    code: 3100
  };
  balancesForCOA.director_capital_header = 0;

  directorRows.slice(0, 5).forEach((d, idx) => {
    const key = `director_capital_${d.id}`;
    const code = 3110 + idx * 10;
    accountsForCOA[key] = {
      name: `Director Capital — ${d.name}`,
      group: "Equity",
      code
    };
    balancesForCOA[key] = Number((balancesBase as any)[key]) || 0;
  });

  function sumGroupCOA(group: "Assets" | "Liabilities" | "Equity" | "Income" | "Expenses") {
    let total = 0;
    for (const [key, meta] of Object.entries(accountsForCOA)) {
      if (meta.group !== group) continue;
      total += Number(balancesForCOA[key] || 0);
    }
    return total;
  }

  const assets = sumGroupCOA("Assets");
  const liabilitiesBalance = sumGroupCOA("Liabilities");
  const equityBalance = sumGroupCOA("Equity");
  const incomeBalance = sumGroupCOA("Income");
  const expenses = sumGroupCOA("Expenses");

  const income = -incomeBalance;
  const net = income - expenses;

  return res.json({
    accounts: accountsForCOA,
    balances: balancesForCOA,
    assets,
    liabilities: -liabilitiesBalance,
    equity: -equityBalance,
    income,
    expenses,
    net
  });
});

export default router;

