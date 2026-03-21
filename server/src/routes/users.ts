import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      directorId: true,
      createdAt: true,
      director: {
        select: { id: true, name: true, initials: true }
      }
    }
  });
  return res.json(users);
});

router.get("/:id", requireRole("ADMIN"), async (req, res) => {
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
      director: { select: { id: true, name: true, initials: true } }
    }
  });
  if (!user) return res.status(404).json(apiError("User not found"));
  return res.json(user);
});

export default router;

