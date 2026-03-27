import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { getEmailQueueStats } from "../services/emailBus.js";
import { canSendEmail, sendEmail } from "../services/emailService.js";

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

/** Immediate delivery test for email plumbing (admin only). */
router.get("/email-test", requireRole("ADMIN"), async (req, res) => {
  const toRaw = String(req.query.to || "").trim().toLowerCase();
  if (!toRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toRaw)) {
    return res.status(400).json({ error: true, message: "Valid ?to=email@example.com is required" });
  }
  const enabled = canSendEmail();
  if (!enabled) {
    return res.status(400).json({
      error: true,
      message: "Resend is not configured. Set RESEND_API_KEY and RESEND_FROM."
    });
  }

  const subject = `Zweck Email Test • ${new Date().toISOString()}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937">
      <h3 style="margin:0 0 8px">Zweck email test</h3>
      <p>This is a direct test from <code>/api/admin/email-test</code>.</p>
      <p>If you received this, Resend is configured correctly.</p>
    </div>
  `;

  try {
    const result = await sendEmail({ to: toRaw, subject, html });
    return res.json({
      ok: true,
      to: toRaw,
      subject,
      provider: "resend",
      result
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      error: true,
      message: "Email provider request failed",
      detail: message
    });
  }
});

export default router;
