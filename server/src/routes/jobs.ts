import { Router } from "express";
import { apiError } from "../lib/http.js";
import { runMeetingReminderJob } from "../lib/meetingReminderJob.js";

const router = Router();

/**
 * Secured by CRON_SECRET (header X-Cron-Secret or Authorization: Bearer).
 * Call daily from Render Cron, GitHub Actions, or another scheduler — not from the browser.
 */
router.post("/meeting-reminders", async (req, res) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return res.status(503).json(apiError("Cron jobs not configured (set CRON_SECRET)"));
  }
  const header = req.headers["x-cron-secret"];
  const auth = req.headers.authorization;
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const provided = (typeof header === "string" ? header : bearer) || "";
  if (provided !== secret) {
    return res.status(401).json(apiError("Unauthorized"));
  }
  try {
    const result = await runMeetingReminderJob();
    return res.json(result);
  } catch (e) {
    return res.status(500).json(apiError(e instanceof Error ? e.message : "Job failed"));
  }
});

export default router;
