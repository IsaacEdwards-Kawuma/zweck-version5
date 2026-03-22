import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireRole("ADMIN"), async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return res.json(rows);
});

export default router;
