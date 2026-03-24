import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();
const updateRoleBody = z.object({
  role: z.enum(["ADMIN", "USER", "DIRECTOR"])
});

function parseLimit(raw: unknown, fallback: number) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 500) return null;
  return Math.floor(n);
}

type LoginEventLike = {
  id: number;
  userId: number;
  createdAt: Date | string;
  logoutAt?: Date | string | null;
  [k: string]: unknown;
};

function withEstimatedSessionDuration<T extends LoginEventLike>(rows: T[]) {
  const burstWindowMinutesRaw = Number(process.env.FAILED_LOGIN_BURST_WINDOW_MINUTES || 10);
  const burstThresholdRaw = Number(process.env.FAILED_LOGIN_BURST_THRESHOLD || 5);
  const burstWindowMinutes = Number.isFinite(burstWindowMinutesRaw) && burstWindowMinutesRaw > 0 ? burstWindowMinutesRaw : 10;
  const burstThreshold = Number.isFinite(burstThresholdRaw) && burstThresholdRaw > 0 ? burstThresholdRaw : 5;
  const FAILED_BURST_WINDOW_MS = burstWindowMinutes * 60 * 1000;
  const FAILED_BURST_THRESHOLD = burstThreshold;
  const enriched = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    sessionDurationMs: null as number | null,
    sessionDurationMinutes: null as number | null,
    sessionState: "UNKNOWN" as "ENDED" | "ACTIVE_ESTIMATE" | "UNKNOWN",
    success: (r as any).success !== false,
    riskLevel: "LOW" as "LOW" | "MEDIUM" | "HIGH",
    riskReasons: [] as string[]
  }));
  const byUserLast = new Map<number, number>();
  const failedHistory = new Map<number, number[]>();
  for (let i = 0; i < enriched.length; i += 1) {
    const current = enriched[i];
    if (!current.success) {
      const ts = new Date(current.createdAt).getTime();
      const prev = failedHistory.get(current.userId) || [];
      const recent = prev.filter((t) => ts - t <= FAILED_BURST_WINDOW_MS);
      recent.push(ts);
      failedHistory.set(current.userId, recent);
      current.sessionState = "ENDED";
      current.sessionDurationMs = 0;
      current.sessionDurationMinutes = 0;
      current.riskReasons.push("FAILED_LOGIN");
      if (recent.length >= FAILED_BURST_THRESHOLD) {
        current.riskReasons.push("FAILED_BURST_10M");
      }
      byUserLast.set(current.userId, i);
      continue;
    }
    const prevIdx = byUserLast.get(current.userId);
    if (prevIdx != null) {
      const prev = enriched[prevIdx];
      const prevTs = new Date(prev.createdAt).getTime();
      const curTs = new Date(current.createdAt).getTime();
      const deltaMs = Math.max(0, curTs - prevTs);
      const prevIp = String((prev as any).ip || "");
      const curIp = String((current as any).ip || "");
      const prevUa = String((prev as any).userAgent || "");
      const curUa = String((current as any).userAgent || "");
      if (prevIp && curIp && prevIp !== curIp) current.riskReasons.push("NEW_IP");
      if (prevUa && curUa && prevUa !== curUa) current.riskReasons.push("NEW_DEVICE");
      if (deltaMs > 0 && deltaMs < 5 * 60 * 1000) current.riskReasons.push("RAPID_RELOGIN");
    }
    if (current.logoutAt) {
      const loginTs = new Date(current.createdAt).getTime();
      const logoutTs = new Date(String(current.logoutAt)).getTime();
      const ms = Math.max(0, logoutTs - loginTs);
      current.sessionDurationMs = ms;
      current.sessionDurationMinutes = Math.round(ms / 60000);
      current.sessionState = "ENDED";
      byUserLast.set(current.userId, i);
      continue;
    }
    if (prevIdx != null) {
      const prev = enriched[prevIdx];
      const prevTs = new Date(prev.createdAt).getTime();
      const curTs = new Date(current.createdAt).getTime();
      const ms = Math.max(0, curTs - prevTs);
      prev.sessionDurationMs = ms;
      prev.sessionDurationMinutes = Math.round(ms / 60000);
      prev.sessionState = "ENDED";
    }
    byUserLast.set(current.userId, i);
  }
  for (const item of enriched) {
    const count = item.riskReasons.length;
    item.riskLevel = count >= 2 ? "HIGH" : count === 1 ? "MEDIUM" : "LOW";
  }
  const now = Date.now();
  for (const idx of byUserLast.values()) {
    const latest = enriched[idx];
    const ts = new Date(latest.createdAt).getTime();
    const ms = Math.max(0, now - ts);
    latest.sessionDurationMs = ms;
    latest.sessionDurationMinutes = Math.round(ms / 60000);
    latest.sessionState = "ACTIVE_ESTIMATE";
  }
  return enriched.reverse();
}

router.get("/", requireRole("ADMIN"), async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      directorId: true,
      createdAt: true,
      director: {
        select: { id: true, name: true, initials: true, avatarUrl: true }
      }
    }
  });
  return res.json(users);
});

router.get("/:id", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      directorId: true,
      createdAt: true,
      director: { select: { id: true, name: true, initials: true, avatarUrl: true } }
    }
  });
  if (!user) return res.status(404).json(apiError("User not found"));
  return res.json(user);
});

router.patch(
  "/:id/role",
  requireRole("ADMIN"),
  validateBody(updateRoleBody),
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

    if (!req.user) return res.status(401).json(apiError("Unauthorized"));
    if (req.user.id === id) {
      return res.status(400).json(apiError("Admin cannot change their own role"));
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json(apiError("User not found"));

    const { role } = req.body as z.infer<typeof updateRoleBody>;

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        directorId: true,
        createdAt: true
      }
    });

    return res.json(updated);
  }
);

router.get("/me/login-events", async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  const limit = parseLimit(req.query?.limit, 50);
  if (limit == null) return res.status(400).json(apiError("Invalid query parameters"));

  const rows = await prisma.loginEvent.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  return res.json(withEstimatedSessionDuration(rows));
});

router.get("/login-events/all", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const limit = parseLimit(req.query?.limit, 200);
  if (limit == null) return res.status(400).json(apiError("Invalid query parameters"));
  const rows = await prisma.loginEvent.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      user: {
        select: { id: true, email: true, role: true }
      }
    }
  });
  return res.json(withEstimatedSessionDuration(rows));
});

router.get("/:id/login-events", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const limit = parseLimit(req.query?.limit, 100);
  if (limit == null) return res.status(400).json(apiError("Invalid query parameters"));

  const rows = await prisma.loginEvent.findMany({
    where: { userId: id },
    orderBy: { createdAt: "asc" },
    take: limit
  });
  return res.json(withEstimatedSessionDuration(rows));
});

export default router;

