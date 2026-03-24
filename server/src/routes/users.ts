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
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return res.json(rows);
});

router.get("/login-events/all", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const limit = parseLimit(req.query?.limit, 200);
  if (limit == null) return res.status(400).json(apiError("Invalid query parameters"));
  const rows = await prisma.loginEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, email: true, role: true }
      }
    }
  });
  return res.json(rows);
});

router.get("/:id/login-events", requireRole("ADMIN"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const limit = parseLimit(req.query?.limit, 100);
  if (limit == null) return res.status(400).json(apiError("Invalid query parameters"));

  const rows = await prisma.loginEvent.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return res.json(rows);
});

export default router;

