import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { deriveBalances, sumGroup } from "../lib/derive.js";
import { apiError } from "../lib/http.js";
import { ACCOUNTS } from "../lib/constants.js";

const router = Router();

router.get("/balances", async (_req, res) => {
  const txs = await prisma.transaction.findMany({ select: { type: true, amount: true } });
  const balances = deriveBalances(txs);
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

  return res.json({ director, capital, sideFund, total: capital + sideFund });
});

router.get("/directors/all", async (_req, res) => {
  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, initials: true, email: true, active: true, avatarUrl: true, joinedRound: true, createdAt: true }
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

  const out = directors.map((d) => {
    const t = totals.get(d.id) ?? { capital: 0, sideFund: 0 };
    return { ...d, capital: t.capital, sideFund: t.sideFund, total: t.capital + t.sideFund };
  });

  return res.json(out);
});

router.get("/summary", async (_req, res) => {
  const txs = await prisma.transaction.findMany({ select: { type: true, amount: true } });
  const balances = deriveBalances(txs);

  const assets = sumGroup(balances, "Assets");
  const equity = sumGroup(balances, "Equity");
  const income = -sumGroup(balances, "Income");
  const expenses = sumGroup(balances, "Expenses");
  const net = income - expenses;

  return res.json({
    accounts: ACCOUNTS,
    balances,
    assets,
    equity: -equity,
    income,
    expenses,
    net
  });
});

export default router;

