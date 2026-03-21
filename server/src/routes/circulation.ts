import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res) => {
  const rounds = await prisma.circulationRound.findMany({ orderBy: [{ round: "desc" }, { position: "asc" }] });
  const recipientIds = Array.from(new Set(rounds.map((r) => r.recipientId)));
  const directors = await prisma.director.findMany({ where: { id: { in: recipientIds } }, select: { id: true, name: true, initials: true } });
  const byId = new Map(directors.map((d) => [d.id, d]));
  return res.json(
    rounds.map((r) => ({
      ...r,
      recipient: byId.get(r.recipientId) ?? null
    }))
  );
});

const createSchema = z.object({
  round: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  recipientId: z.number().int().positive(),
  approved: z.boolean().optional(),
  amountPerMember: z.number().nonnegative(),
  totalCollected: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional()
});

router.post("/", validateBody(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const director = await prisma.director.findUnique({ where: { id: body.recipientId } });
  if (!director) return res.status(400).json(apiError("Recipient director not found", "recipientId"));

  const created = await prisma.circulationRound.create({
    data: {
      round: body.round,
      position: body.position,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      recipientId: body.recipientId,
      approved: body.approved ?? false,
      amountPerMember: body.amountPerMember,
      totalCollected: body.totalCollected,
      notes: body.notes
    }
  });
  return res.status(201).json(created);
});

const updateSchema = createSchema.partial().omit({ recipientId: true });

router.put("/:id", validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body as z.infer<typeof updateSchema>;

  const data: any = { ...body };
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.endDate) data.endDate = new Date(data.endDate);

  try {
    const updated = await prisma.circulationRound.update({ where: { id }, data });
    return res.json(updated);
  } catch {
    return res.status(404).json(apiError("Circulation round not found"));
  }
});

export default router;

