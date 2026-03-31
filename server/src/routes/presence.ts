import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { presenceOfflineThresholdMs } from "../lib/presenceConstants.js";
import { loginDeniedMessage } from "../lib/userLifecycle.js";

const router = Router();

/**
 * Client should POST periodically while the app is open (e.g. every 45s).
 * Updates last heartbeat and starts a new presence session after an offline gap.
 */
router.post("/heartbeat", async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      lastHeartbeatAt: true,
      presenceSessionStartedAt: true,
      deletedAt: true,
      isActive: true,
      adminBlockedAt: true
    }
  });
  if (!user) return res.status(404).json(apiError("User not found"));
  const denied = loginDeniedMessage(user);
  if (denied) return res.status(403).json(apiError(denied));

  const gapMs = user.lastHeartbeatAt ? now.getTime() - user.lastHeartbeatAt.getTime() : Number.POSITIVE_INFINITY;
  const threshold = presenceOfflineThresholdMs();
  const newSession = !user.lastHeartbeatAt || gapMs > threshold;

  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      lastHeartbeatAt: now,
      presenceSessionStartedAt: newSession ? now : user.presenceSessionStartedAt ?? now
    }
  });

  return res.json({ ok: true, serverTime: now.toISOString(), offlineThresholdMs: threshold });
});

/** Admin: list all users with computed online/offline and duration fields. */
router.get("/", requireRole("ADMIN"), async (_req: Request, res: Response) => {
  const threshold = presenceOfflineThresholdMs();
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      lastHeartbeatAt: true,
      presenceSessionStartedAt: true,
      director: { select: { id: true, name: true, initials: true } }
    }
  });

  const now = Date.now();
  const rows = users.map((u) => {
    const last = u.lastHeartbeatAt?.getTime() ?? null;
    const isOnline = last != null && now - last < threshold;
    let onlineDurationSec: number | null = null;
    let offlineDurationSec: number | null = null;
    if (isOnline) {
      const start = u.presenceSessionStartedAt?.getTime() ?? last;
      onlineDurationSec = Math.max(0, Math.floor((now - start) / 1000));
    } else if (last != null) {
      offlineDurationSec = Math.max(0, Math.floor((now - last) / 1000));
    }
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      director: u.director,
      lastHeartbeatAt: u.lastHeartbeatAt?.toISOString() ?? null,
      presenceSessionStartedAt: u.presenceSessionStartedAt?.toISOString() ?? null,
      isOnline,
      onlineDurationSec,
      offlineDurationSec
    };
  });

  return res.json({
    offlineThresholdMs: threshold,
    serverTime: new Date().toISOString(),
    users: rows
  });
});

export default router;
