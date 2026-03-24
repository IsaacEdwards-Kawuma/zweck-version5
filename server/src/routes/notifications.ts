import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";

const router = Router();

router.get("/", async (req, res) => {
  const user = req.user!;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null }
  });

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      link: true,
      meetingId: true,
      readAt: true,
      createdAt: true
    }
  });

  res.json({ unreadCount, items });
});

router.post("/read-all", async (req, res) => {
  const user = req.user!;
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });
  res.json({ updated: result.count });
});

router.patch("/:id/read", async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json(apiError("Invalid notification id"));
  }

  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });

  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id, userId: user.id }
    });
    if (!exists) return res.status(404).json(apiError("Not found"));
  }

  res.json({ ok: true });
});

export default router;
