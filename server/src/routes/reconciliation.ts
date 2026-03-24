import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { validateBody } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const db: any = prisma;

const upsertSchema = z.object({
  periodFrom: z.string().min(1).max(20),
  statementDate: z.string().min(1).max(20),
  notes: z.string().max(15000).optional().nullable(),
  clearedMap: z.record(z.string(), z.boolean()).optional()
});

router.get("/", async (req, res) => {
  const periodFrom = String(req.query.periodFrom || "");
  const statementDate = String(req.query.statementDate || "");
  if (!periodFrom || !statementDate) return res.status(400).json(apiError("periodFrom and statementDate are required"));

  const row = await db.reconciliationNote.findUnique({
    where: {
      periodFrom_statementDate: { periodFrom, statementDate }
    }
  });
  return res.json(row || { periodFrom, statementDate, notes: "", clearedMap: {} });
});

router.put("/", requireRole("ADMIN"), validateBody(upsertSchema), async (req, res) => {
  const body = req.body as z.infer<typeof upsertSchema>;
  const uid = req.user?.id ?? null;
  const row = await db.reconciliationNote.upsert({
    where: {
      periodFrom_statementDate: { periodFrom: body.periodFrom, statementDate: body.statementDate }
    },
    update: {
      notes: body.notes ?? "",
      clearedMap: body.clearedMap ?? {},
      updatedById: uid
    },
    create: {
      periodFrom: body.periodFrom,
      statementDate: body.statementDate,
      notes: body.notes ?? "",
      clearedMap: body.clearedMap ?? {},
      createdById: uid,
      updatedById: uid
    }
  });
  await db.auditLog.create({
    data: {
      userId: req.user?.id ?? 0,
      action: "UPSERT_RECONCILIATION_NOTE",
      entityType: "ReconciliationNote",
      entityId: row.id,
      before: null,
      after: row as any
    }
  });
  return res.json(row);
});

export default router;
