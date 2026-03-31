import { Router } from "express";
import { TransactionPostingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { deriveBalances } from "../lib/derive.js";
import { apiError } from "../lib/http.js";
import { ACCOUNTS } from "../lib/constants.js";
import { requireRole } from "../middleware/auth.js";
import { canViewDirectorContact, canViewDirectorFinancials } from "../lib/directorVisibility.js";

const router = Router();

function viewerFromReq(req: any) {
  return { role: req.user!.role, directorId: req.user!.directorId ?? null };
}

// All authenticated roles (including USER) may access director pages and summaries.

/** Positive "capital" display = negated derived equity line (see `derive.ts` sign convention). */
function directorCapitalDisplay(balances: Record<string, number>, directorId: number): number {
  const raw = Number(balances[`director_capital_${directorId}`] || 0);
  return -raw;
}

function directorSideFundDisplay(balances: Record<string, number>, directorId: number): number {
  const raw = Number(balances[`director_side_fund_${directorId}`] || 0);
  return -raw;
}

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
      postingStatus: true,
      reversalOfId: true,
      manualDebitAccountKey: true,
      manualCreditAccountKey: true
    }
  });
  const balances = deriveBalances(txs as any);
  // Backward-compatible aggregate used by dashboard cards.
  balances.bank =
    Number((balances as any).bank_eur || 0) +
    Number((balances as any).bank_usd || 0) +
    Number((balances as any).bank_ugx || 0);
  return res.json(balances);
});

router.get("/director/:id", requireRole("DIRECTOR"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const director = await prisma.director.findUnique({
    where: { id },
    select: { id: true, name: true, initials: true, email: true, avatarUrl: true }
  });
  if (!director) return res.status(404).json(apiError("Director not found"));

  const viewer = viewerFromReq(req);
  if (!canViewDirectorFinancials(viewer, id)) return res.status(403).json(apiError("Forbidden"));

  const directorOut = canViewDirectorContact(viewer, id)
    ? director
    : { id: director.id, name: director.name, initials: director.initials, avatarUrl: director.avatarUrl };

  const allForDerive = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      currency: true,
      directorId: true,
      postingStatus: true,
      reversalOfId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true,
      manualDebitAccountKey: true,
      manualCreditAccountKey: true
    }
  });
  const balances = deriveBalances(allForDerive as any);
  const b = balances as Record<string, number>;
  const capital = directorCapitalDisplay(b, id);
  const sideFund = directorSideFundDisplay(b, id);

  const directorsAll = await prisma.director.findMany({ select: { id: true } });
  let contributionBase = 0;
  for (const d of directorsAll) {
    contributionBase += directorCapitalDisplay(b, d.id);
  }
  const equitySharePct = contributionBase > 0 ? Math.round(((capital / contributionBase) * 100) * 100) / 100 : 0;
  return res.json({ director: directorOut, capital, sideFund, total: capital + sideFund, equitySharePct });
});

router.get(
  "/directors/all",
  requireRole("DIRECTOR"),
  async (req, res) => {
  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, initials: true, email: true, active: true, avatarUrl: true, createdAt: true }
  });
  const viewer = viewerFromReq(req);
  const directorsOut = directors.map((d) =>
    canViewDirectorContact(viewer, d.id)
      ? d
      : { id: d.id, name: d.name, initials: d.initials, active: d.active, avatarUrl: d.avatarUrl, createdAt: d.createdAt }
  );

  const allForDerive = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      currency: true,
      directorId: true,
      postingStatus: true,
      reversalOfId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true,
      manualDebitAccountKey: true,
      manualCreditAccountKey: true
    }
  });
  const balances = deriveBalances(allForDerive as any);
  const b = balances as Record<string, number>;

  const outRaw = directorsOut.map((d: any) => {
    const capital = directorCapitalDisplay(b, d.id);
    const sideFund = directorSideFundDisplay(b, d.id);
    return { ...d, capital, sideFund, total: capital + sideFund };
  });
  const out = withEquityShareFromContribution(outRaw);

  return res.json(out);
  }
);

router.get("/directors", requireRole("DIRECTOR"), async (req, res) => {
  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, initials: true, email: true, active: true, avatarUrl: true, createdAt: true }
  });
  const viewer = viewerFromReq(req);
  const directorsOut = directors.map((d) =>
    canViewDirectorContact(viewer, d.id)
      ? d
      : { id: d.id, name: d.name, initials: d.initials, active: d.active, avatarUrl: d.avatarUrl, createdAt: d.createdAt }
  );

  const allForDerive = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      currency: true,
      directorId: true,
      postingStatus: true,
      reversalOfId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true,
      manualDebitAccountKey: true,
      manualCreditAccountKey: true
    }
  });
  const balances = deriveBalances(allForDerive as any);
  const b = balances as Record<string, number>;

  const outRaw = directorsOut.map((d: any) => {
    const capital = directorCapitalDisplay(b, d.id);
    const sideFund = directorSideFundDisplay(b, d.id);
    return { ...d, capital, sideFund, total: capital + sideFund };
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
      postingStatus: true,
      reversalOfId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true,
      manualDebitAccountKey: true,
      manualCreditAccountKey: true
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

    const sfKey = `director_side_fund_${d.id}`;
    accountsForCOA[sfKey] = {
      name: `Side Fund — ${d.name}`,
      group: "Equity",
      code: 3201 + idx
    };
    balancesForCOA[sfKey] = Number((balancesBase as any)[sfKey]) || 0;
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

