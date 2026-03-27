import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { getEmailQueueStats } from "../services/emailBus.js";

const router = Router();
const MAX_TX = 100_000;

/**
 * JSON snapshot for backups / DR (admin). Transactions capped; not a full SQL dump.
 */
router.get("/export", requireRole("ADMIN"), async (_req, res) => {
  const [directors, meetings, documents, transactions, reconciliationNotes, users] = await Promise.all([
    prisma.director.findMany({ orderBy: { id: "asc" } }),
    prisma.meeting.findMany({ orderBy: { id: "asc" } }),
    prisma.documentRegister.findMany({ orderBy: { id: "asc" } }),
    prisma.transaction.findMany({
      take: MAX_TX,
      orderBy: { id: "asc" },
      include: { director: true }
    }),
    prisma.reconciliationNote.findMany({ orderBy: { id: "asc" } }),
    prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        email: true,
        role: true,
        directorId: true,
        lastLoginAt: true,
        createdAt: true
      }
    })
  ]);

  const body = {
    version: 1,
    exportedAt: new Date().toISOString(),
    note: `Transactions included up to ${MAX_TX} rows (oldest by id). Use database backups for a full copy.`,
    directors,
    meetings,
    documents,
    transactions,
    reconciliationNotes,
    users
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="zweckos-export-${new Date().toISOString().slice(0, 10)}.json"`);
  return res.json(body);
});

/** Debug endpoint for email queue health/usage (admin only). */
router.get("/email-queue", requireRole("ADMIN"), async (_req, res) => {
  return res.json({
    now: new Date().toISOString(),
    ...getEmailQueueStats()
  });
});

export default router;
