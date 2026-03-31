import { Router } from "express";
import { apiError } from "../lib/http.js";
import { runMeetingReminderJob } from "../lib/meetingReminderJob.js";
import { runInvoiceOverdueJob } from "../lib/invoiceOverdueJob.js";
import { runMonthlyStatementReminderJob } from "../lib/monthlyStatementReminderJob.js";

const router = Router();

/**
 * Secured by CRON_SECRET (header X-Cron-Secret or Authorization: Bearer).
 * Call daily from Render Cron, GitHub Actions, or another scheduler — not from the browser.
 */
async function requireCronSecret(req: any, res: any): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    res.status(503).json(apiError("Cron jobs not configured (set CRON_SECRET)"));
    return false;
  }
  const header = req.headers["x-cron-secret"];
  const auth = req.headers.authorization;
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const provided = (typeof header === "string" ? header : bearer) || "";
  if (provided !== secret) {
    res.status(401).json(apiError("Unauthorized"));
    return false;
  }
  return true;
}

router.post("/meeting-reminders", async (req, res) => {
  if (!(await requireCronSecret(req, res))) return;
  try {
    const result = await runMeetingReminderJob();
    return res.json(result);
  } catch (e) {
    return res.status(500).json(apiError(e instanceof Error ? e.message : "Job failed"));
  }
});

router.post("/invoices/flag-overdue", async (req, res) => {
  if (!(await requireCronSecret(req, res))) return;
  try {
    const result = await runInvoiceOverdueJob();
    return res.json(result);
  } catch (e) {
    return res.status(500).json(apiError(e instanceof Error ? e.message : "Job failed"));
  }
});

/** First day of each month (UTC): in-app reminder to directors and admins about Reports / monthly statements. */
router.post("/monthly-statement-reminders", async (req, res) => {
  if (!(await requireCronSecret(req, res))) return;
  try {
    const result = await runMonthlyStatementReminderJob();
    return res.json(result);
  } catch (e) {
    return res.status(500).json(apiError(e instanceof Error ? e.message : "Job failed"));
  }
});

export default router;
