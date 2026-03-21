import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { deriveBalances } from "../lib/derive.js";

const router = Router();

router.get("/", async (_req, res) => {
  const txs = await prisma.transaction.findMany({ select: { type: true, amount: true } });
  const balances = deriveBalances(txs);

  const bank = balances.bank;
  const mmf = balances.mmf;
  const ypa = balances.ypa;
  const totalAssets = bank + mmf + ypa;
  const mmfReturns = -balances.mmf_income;

  return res.json({
    assets: { bank, mmf, ypa },
    mmfReturns,
    totalAssets,
    percent: totalAssets > 0 ? { bank: bank / totalAssets, mmf: mmf / totalAssets, ypa: ypa / totalAssets } : { bank: 0, mmf: 0, ypa: 0 }
  });
});

export default router;

