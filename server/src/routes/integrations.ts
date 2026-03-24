import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

/**
 * Admin-only test hook for Zapier/n8n: records payload in audit log (no side effects).
 */
router.post("/ping", requireRole("ADMIN"), async (req, res) => {
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "INTEGRATION_PING",
      entityType: "Integration",
      entityId: 0,
      after: (req.body ?? {}) as Prisma.InputJsonValue
    }
  });
  return res.json({ ok: true, receivedAt: new Date().toISOString() });
});

export default router;
