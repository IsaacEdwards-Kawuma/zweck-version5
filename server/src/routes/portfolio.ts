import { Router } from "express";
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

function directorCapitalDisplay(balances: Record<string, number>, directorId: number): number {
  const raw = Number(balances[`director_capital_${directorId}`] || 0);
  return -raw;
}

function directorSideFundDisplay(balances: Record<string, number>, directorId: number): number {
  const raw = Number(balances[`director_side_fund_${directorId}`] || 0);
  return -raw;
}

router.get("/", async (_req, res) => {
  const txs = await prisma.transaction.findMany({
    select: {
      type: true,
      amount: true,
      directorId: true,
      currency: true,
      postingStatus: true,
      reversalOfId: true,
      expensePaymentMode: true,
      transferFromAccountKey: true,
      transferToAccountKey: true
    }
  });
  const balances = deriveBalances(txs as any);
  const b = balances as Record<string, number>;

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

  let totalEquity = 0;
  let totalCapital = 0;
  let totalSideFund = 0;
  for (const d of directors) {
    const cap = directorCapitalDisplay(b, d.id);
    const sf = directorSideFundDisplay(b, d.id);
    totalEquity += cap + sf;
    totalCapital += cap;
    totalSideFund += sf;
  }

  const memberRows = directors.map((d) => {
    const capital = directorCapitalDisplay(b, d.id);
    const sideFund = directorSideFundDisplay(b, d.id);
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
      totalSideFund,
      count: directors.length,
      activeCount: directors.filter((d) => d.active).length,
      list: memberRows
    }
  });
});

export default router;
