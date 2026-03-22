import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

router.get("/", async (req, res) => {
  const raw = req.query.projectId as string | undefined;
  const projectId = raw != null && raw !== "" ? Number(raw) : undefined;
  const where =
    projectId !== undefined && Number.isFinite(projectId) ? { projectId } : {};
  const entries = await prisma.mMFEntry.findMany({
    where,
    orderBy: [{ month: "desc" }, { id: "desc" }]
  });
  return res.json(entries);
});

const createSchema = z.object({
  directorId: z.number().int().positive(),
  projectId: z.number().int().positive().optional().nullable(),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  principal: z.number().nonnegative(),
  interest: z.number().nonnegative(),
  interestRate: z.number().nonnegative(),
  accountType: z.string().min(1).max(50),
  notes: z.string().max(500).optional()
});

router.post("/", validateBody(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const director = await prisma.director.findUnique({ where: { id: body.directorId } });
  if (!director) return res.status(400).json(apiError("Director not found", "directorId"));

  if (body.projectId != null) {
    const proj = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!proj) return res.status(400).json(apiError("Project not found", "projectId"));
    if (proj.projectKind !== "MMF") {
      return res.status(400).json(apiError("MMF entries must be linked to a project with program MMF", "projectId"));
    }
  }

  const entry = await prisma.mMFEntry.create({
    data: {
      directorId: body.directorId,
      projectId: body.projectId === null ? null : body.projectId ?? undefined,
      month: body.month,
      principal: body.principal,
      interest: body.interest,
      interestRate: body.interestRate,
      accountType: body.accountType,
      notes: body.notes
    }
  });
  return res.status(201).json(entry);
});

const updateSchema = createSchema.partial().omit({ directorId: true });

router.put("/:id", validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body as z.infer<typeof updateSchema>;
  if (body.projectId !== undefined && body.projectId !== null) {
    const proj = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!proj) return res.status(400).json(apiError("Project not found", "projectId"));
    if (proj.projectKind !== "MMF") {
      return res.status(400).json(apiError("MMF entries must be linked to a project with program MMF", "projectId"));
    }
  }
  try {
    const updated = await prisma.mMFEntry.update({ where: { id }, data: body });
    return res.json(updated);
  } catch {
    return res.status(404).json(apiError("MMF entry not found"));
  }
});

export default router;

