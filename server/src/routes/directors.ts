import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res) => {
  const directors = await prisma.director.findMany({ orderBy: { createdAt: "asc" } });
  return res.json(directors);
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  initials: z.string().min(1).max(3),
  email: z.string().email(),
  joinedRound: z.number().int().positive().optional(),
  active: z.boolean().optional()
});

router.post("/", requireRole("ADMIN"), validateBody(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const email = body.email.toLowerCase().trim();

  const existing = await prisma.director.findUnique({ where: { email } });
  if (existing) return res.status(400).json(apiError("Email already in use", "email"));

  const director = await prisma.director.create({
    data: {
      name: body.name,
      initials: body.initials.toUpperCase(),
      email,
      joinedRound: body.joinedRound ?? 1,
      active: body.active ?? true
    }
  });

  return res.status(201).json(director);
});

const updateSchema = createSchema.partial();

router.put("/:id", validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const body = req.body as z.infer<typeof updateSchema>;
  const data: any = { ...body };
  if (data.email) data.email = data.email.toLowerCase().trim();
  if (data.initials) data.initials = data.initials.toUpperCase();

  try {
    const updated = await prisma.director.update({ where: { id }, data });
    return res.json(updated);
  } catch {
    return res.status(404).json(apiError("Director not found"));
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const director = await prisma.director.findUnique({ where: { id } });
  if (!director) return res.status(404).json(apiError("Director not found"));

  const transactions = await prisma.transaction.findMany({
    where: { directorId: id, type: { in: ["CONTRIBUTION", "SIDE_FUND", "PENALTY"] } },
    orderBy: { date: "desc" }
  });

  return res.json({ director, transactions });
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const hasTx = await prisma.transaction.count({ where: { directorId: id } });
  if (hasTx > 0) {
    return res
      .status(400)
      .json(
        apiError(
          "Cannot delete director with existing transactions. Consider marking them inactive instead.",
          "id"
        )
      );
  }

  try {
    await prisma.director.delete({ where: { id } });
    return res.json({ ok: true });
  } catch {
    return res.status(404).json(apiError("Director not found"));
  }
});

export default router;

