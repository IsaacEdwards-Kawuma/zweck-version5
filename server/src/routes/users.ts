import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notifyUser } from "../services/inAppNotifications.js";
import { writeAudit } from "../lib/audit.js";
import { countAbleAdmins } from "../lib/userLifecycle.js";
import { hasAdminPrivileges } from "../lib/roles.js";

const router = Router();
const updateRoleBody = z.object({
  role: z.enum([
    "ADMIN",
    "ADMIN_DIRECTOR",
    "USER",
    "DIRECTOR",
    "TREASURER",
    "SECRETARY",
    "OPERATIONAL_MANAGER",
    "CEO"
  ])
});

const blockUserBody = z.object({
  reason: z.string().max(500).optional().nullable()
});

function parseUserIdParam(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isFinite(id) ? id : null;
}

async function assertNotLastAbleAdmin(targetId: number): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, deletedAt: true, isActive: true, adminBlockedAt: true }
  });
  if (!target || !hasAdminPrivileges(target.role)) return;
  const able = !target.deletedAt && target.isActive && !target.adminBlockedAt;
  if (!able) return;
  const n = await countAbleAdmins();
  if (n <= 1) {
    throw new Error("LAST_ADMIN");
  }
}

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
    if (!current) continue;
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
      if (!prev) continue;
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
      if (!prev) continue;
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
    if (!latest) continue;
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
      isActive: true,
      deletedAt: true,
      adminBlockedAt: true,
      adminBlockedReason: true,
      director: {
        select: { id: true, name: true, initials: true, avatarUrl: true }
      }
    }
  });
  return res.json(users);
});

router.post("/:id/deactivate", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = parseUserIdParam(req);
  if (id == null) return res.status(400).json(apiError("Invalid id"));
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  if (req.user.id === id) return res.status(400).json(apiError("You cannot deactivate your own account"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json(apiError("User not found"));
  if (target.deletedAt) return res.status(400).json(apiError("User is already removed"));
  try {
    await assertNotLastAbleAdmin(id);
  } catch (e) {
    if (e instanceof Error && e.message === "LAST_ADMIN") {
      return res.status(400).json(apiError("Cannot deactivate the last administrator"));
    }
    throw e;
  }
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await writeAudit(req, {
    action: "USER_DEACTIVATE",
    entityType: "User",
    entityId: id,
    before: { email: target.email, isActive: target.isActive },
    after: { isActive: false }
  });
  return res.json({ ok: true });
});

router.post("/:id/reactivate", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = parseUserIdParam(req);
  if (id == null) return res.status(400).json(apiError("Invalid id"));
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json(apiError("User not found"));
  if (target.deletedAt) return res.status(400).json(apiError("Use restore for removed accounts"));
  await prisma.user.update({ where: { id }, data: { isActive: true } });
  await writeAudit(req, {
    action: "USER_REACTIVATE",
    entityType: "User",
    entityId: id,
    before: { email: target.email, isActive: target.isActive },
    after: { isActive: true }
  });
  return res.json({ ok: true });
});

router.post("/:id/block", requireRole("ADMIN"), validateBody(blockUserBody), async (req: Request, res: Response) => {
  const id = parseUserIdParam(req);
  if (id == null) return res.status(400).json(apiError("Invalid id"));
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  if (req.user.id === id) return res.status(400).json(apiError("You cannot block your own account"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json(apiError("User not found"));
  if (target.deletedAt) return res.status(400).json(apiError("User is already removed"));
  try {
    await assertNotLastAbleAdmin(id);
  } catch (e) {
    if (e instanceof Error && e.message === "LAST_ADMIN") {
      return res.status(400).json(apiError("Cannot block the last administrator"));
    }
    throw e;
  }
  const reason = (req.body as z.infer<typeof blockUserBody>).reason?.trim() || null;
  const now = new Date();
  await prisma.user.update({
    where: { id },
    data: { adminBlockedAt: now, adminBlockedReason: reason }
  });
  await writeAudit(req, {
    action: "USER_BLOCK",
    entityType: "User",
    entityId: id,
    before: { email: target.email, adminBlockedAt: target.adminBlockedAt },
    after: { adminBlockedAt: now.toISOString(), adminBlockedReason: reason }
  });
  return res.json({ ok: true });
});

router.post("/:id/unblock", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = parseUserIdParam(req);
  if (id == null) return res.status(400).json(apiError("Invalid id"));
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json(apiError("User not found"));
  await prisma.user.update({
    where: { id },
    data: { adminBlockedAt: null, adminBlockedReason: null }
  });
  await writeAudit(req, {
    action: "USER_UNBLOCK",
    entityType: "User",
    entityId: id,
    before: { email: target.email, adminBlockedAt: target.adminBlockedAt },
    after: { adminBlockedAt: null }
  });
  return res.json({ ok: true });
});

router.delete("/:id", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = parseUserIdParam(req);
  if (id == null) return res.status(400).json(apiError("Invalid id"));
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  if (req.user.id === id) return res.status(400).json(apiError("You cannot remove your own account"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json(apiError("User not found"));
  if (target.deletedAt) return res.status(400).json(apiError("User is already removed"));
  try {
    await assertNotLastAbleAdmin(id);
  } catch (e) {
    if (e instanceof Error && e.message === "LAST_ADMIN") {
      return res.status(400).json(apiError("Cannot remove the last administrator"));
    }
    throw e;
  }
  const now = new Date();
  await prisma.user.update({
    where: { id },
    data: { deletedAt: now, isActive: false }
  });
  await writeAudit(req, {
    action: "USER_SOFT_DELETE",
    entityType: "User",
    entityId: id,
    before: { email: target.email, deletedAt: null },
    after: { deletedAt: now.toISOString() }
  });
  return res.json({ ok: true });
});

router.post("/:id/restore", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = parseUserIdParam(req);
  if (id == null) return res.status(400).json(apiError("Invalid id"));
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json(apiError("User not found"));
  if (!target.deletedAt) return res.status(400).json(apiError("User is not removed"));
  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: null,
      isActive: true,
      adminBlockedAt: null,
      adminBlockedReason: null
    }
  });
  await writeAudit(req, {
    action: "USER_RESTORE",
    entityType: "User",
    entityId: id,
    before: { email: target.email, deletedAt: target.deletedAt },
    after: { deletedAt: null, isActive: true }
  });
  return res.json({ ok: true });
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
      isActive: true,
      deletedAt: true,
      adminBlockedAt: true,
      adminBlockedReason: true,
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
      data: { role: role as Role },
      select: {
        id: true,
        email: true,
        role: true,
        directorId: true,
        createdAt: true
      }
    });

    if (existing.role !== role) {
      const label = (r: string) =>
        r === "ADMIN"
          ? "Admin"
          : r === "ADMIN_DIRECTOR"
            ? "Admin / Director"
            : r === "DIRECTOR"
              ? "Director"
              : r === "TREASURER"
                ? "Treasurer"
                : r === "SECRETARY"
                  ? "Secretary"
                  : r === "OPERATIONAL_MANAGER"
                    ? "Operational manager"
                    : r === "CEO"
                      ? "CEO"
                      : "User";
      await notifyUser(
        id,
        "ROLE_CHANGED",
        "Your role was updated",
        `Your access level changed from ${label(existing.role)} to ${label(role)}.`,
        "/settings"
      );
    }

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

