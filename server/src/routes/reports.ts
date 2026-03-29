import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { validateBody } from "../middleware/validate.js";
import { notifyUser } from "../services/inAppNotifications.js";

const router = Router();

const eventSchema = z.object({
  action: z.enum(["PRINT", "EXPORT_CSV"]),
  statement: z.string().min(1).max(60),
  mode: z.string().min(1).max(20).optional().default("detailed"),
  rangeFrom: z.string().max(20).nullable().optional(),
  rangeTo: z.string().max(20).nullable().optional()
});

router.post("/events", validateBody(eventSchema), async (req, res) => {
  const body = req.body as z.infer<typeof eventSchema>;
  await prisma.auditLog.create({
    data: {
      userId: req.user?.id ?? 0,
      action: `REPORT_${body.action}`,
      entityType: "Report",
      entityId: null,
      after: {
        statement: body.statement,
        mode: body.mode,
        rangeFrom: body.rangeFrom ?? null,
        rangeTo: body.rangeTo ?? null
      } as any
    }
  });
  if (body.action === "EXPORT_CSV" && req.user?.id) {
    await notifyUser(
      req.user.id,
      "REPORT_READY",
      "Report export ready",
      `${body.statement}${body.rangeFrom || body.rangeTo ? ` (${[body.rangeFrom, body.rangeTo].filter(Boolean).join(" – ")})` : ""}`,
      "/reports"
    );
  }
  return res.status(201).json({ ok: true });
});

export default router;

