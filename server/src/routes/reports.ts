import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { validateBody } from "../middleware/validate.js";
import { getPublicAppUrl } from "../lib/publicAppUrl.js";
import { EMAIL_EVENTS, enqueueEmail } from "../services/emailBus.js";

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
  if (body.action === "EXPORT_CSV" && req.user?.email) {
    const appUrl = getPublicAppUrl() || "http://localhost:5173";
    enqueueEmail({
      type: EMAIL_EVENTS.REPORT_READY,
      recipient: req.user.email,
      payload: { link: `${appUrl}/reports` },
      dedupeKey: `report-ready:${req.user.id}:${body.statement}:${body.rangeFrom || ""}:${body.rangeTo || ""}`
    });
  }
  return res.status(201).json({ ok: true });
});

export default router;

