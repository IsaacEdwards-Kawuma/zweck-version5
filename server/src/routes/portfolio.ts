import { Router } from "express";
import { TransactionPostingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { deriveBalances } from "../lib/derive.js";

const router = Router();

type ActiveProjectForSplit = {
  id: number;
  code: string;
  name: string;
  budgetSpent: number | null;
  tasks: Array<{ actualCost: number | null }>;
};

export function buildPortfolioSplit(bank: number, activeProjects: ActiveProjectForSplit[]) {
  const projectSplit = activeProjects
    .map((p) => {
      const spentFromTasks = p.tasks.reduce((sum, t) => sum + (t.actualCost ?? 0), 0);
      const value = p.budgetSpent ?? spentFromTasks;
      return {
        key: `project-${p.id}`,
        name: p.code ? `${p.code} · ${p.name}` : p.name,
        value
      };
    })
    .filter((p) => p.value > 0);

  return [{ key: "bank", name: "Bank", value: bank }, ...projectSplit];
}

router.get("/", async (_req, res) => {
  const txs = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      directorId: true,
      currency: true,
      postingStatus: true,
      reversalOfId: true
    }
  });
  const balances = deriveBalances(txs as any);

  const bank =
    (balances.bank_ugx || 0) + (balances.bank_usd || 0) + (balances.bank_eur || 0);
  const mmf = balances.mmf;
  const ypa = balances.ypa;
  const mmfReturns = -balances.mmf_income;

  const activeProjects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      code: true,
      name: true,
      budgetSpent: true,
      tasks: { select: { actualCost: true } }
    },
    orderBy: { updatedAt: "desc" }
  });

  const split = buildPortfolioSplit(bank, activeProjects);
  const splitTotal = split.reduce((sum, item) => sum + item.value, 0);
  const totalAssets = splitTotal;

  const directors = await prisma.director.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      initials: true,
      email: true,
      avatarUrl: true,
      active: true,
      createdAt: true
    }
  });

  const totals = new Map<number, { capital: number; sideFund: number }>();
  for (const d of directors) totals.set(d.id, { capital: 0, sideFund: 0 });
  for (const t of txs) {
    if (!t.directorId || t.type !== "CONTRIBUTION") continue;
    const cur = totals.get(t.directorId) ?? { capital: 0, sideFund: 0 };
    if (t.postingStatus !== TransactionPostingStatus.POSTED) continue;
    if (t.reversalOfId != null) cur.capital -= t.amount;
    else cur.capital += t.amount;
    totals.set(t.directorId, cur);
  }

  let totalEquity = 0;
  let totalCapital = 0;
  for (const d of directors) {
    const row = totals.get(d.id) ?? { capital: 0, sideFund: 0 };
    totalEquity += row.capital + row.sideFund;
    totalCapital += row.capital;
  }

  const memberRows = directors.map((d) => {
    const row = totals.get(d.id) ?? { capital: 0, sideFund: 0 };
    const capital = row.capital;
    const sideFund = row.sideFund;
    const memberTotal = capital + sideFund;
    return {
      ...d,
      capital,
      sideFund,
      total: memberTotal,
      equityShare: totalEquity > 0 ? memberTotal / totalEquity : 0,
      capitalShare: totalCapital > 0 ? capital / totalCapital : 0
    };
  });

  memberRows.sort((a, b) => b.total - a.total);

  return res.json({
    assets: { bank, mmf, ypa },
    mmfReturns,
    totalAssets,
    split,
    percent:
      totalAssets > 0
        ? { bank: bank / totalAssets, mmf: mmf / totalAssets, ypa: ypa / totalAssets }
        : { bank: 0, mmf: 0, ypa: 0 },
    directors: {
      totalEquity,
      totalCapital,
      count: directors.length,
      activeCount: directors.filter((d) => d.active).length,
      list: memberRows
    }
  });
});

export default router;

