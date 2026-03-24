import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();
const db: any = prisma;

const docSchema = z.object({
  title: z.string().min(1).max(300),
  category: z.string().max(80).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  owner: z.string().max(200).optional().nullable(),
  confidentiality: z.string().max(80).optional().nullable(),
  status: z.string().max(40).optional().nullable(),
  version: z.string().max(40).optional().nullable(),
  tags: z.string().max(1200).optional().nullable(),
  effectiveDate: z.string().max(20).optional().nullable(),
  reviewDate: z.string().max(20).optional().nullable(),
  expiryDate: z.string().max(20).optional().nullable(),
  pinned: z.boolean().optional(),
  url: z.string().max(2000).optional().nullable(),
  notes: z.string().max(15000).optional().nullable()
});

const updateDocSchema = docSchema.partial();

router.get("/", async (_req, res) => {
  const rows = await db.documentRegister.findMany({
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }]
  });
  res.json(rows);
});

router.post("/", requireRole("ADMIN"), validateBody(docSchema), async (req, res) => {
  const body = req.body as z.infer<typeof docSchema>;
  const uid = req.user?.id ?? null;
  const row = await db.documentRegister.create({
    data: {
      ...body,
      createdById: uid,
      updatedById: uid
    }
  });
  await db.auditLog.create({
    data: {
      userId: req.user?.id ?? 0,
      action: "CREATE_DOCUMENT",
      entityType: "Document",
      entityId: row.id,
      before: null,
      after: row as any
    }
  });
  return res.status(201).json(row);
});

router.put("/:id", requireRole("ADMIN"), validateBody(updateDocSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid document id"));
  const body = req.body as z.infer<typeof updateDocSchema>;
  try {
    const before = await db.documentRegister.findUnique({ where: { id } });
    const row = await db.documentRegister.update({
      where: { id },
      data: { ...body, updatedById: req.user?.id ?? null }
    });
    await db.auditLog.create({
      data: {
        userId: req.user?.id ?? 0,
        action: "UPDATE_DOCUMENT",
        entityType: "Document",
        entityId: row.id,
        before: before as any,
        after: row as any
      }
    });
    return res.json(row);
  } catch {
    return res.status(404).json(apiError("Document not found"));
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid document id"));
  try {
    const before = await db.documentRegister.findUnique({ where: { id } });
    await db.documentRegister.delete({ where: { id } });
    await db.auditLog.create({
      data: {
        userId: req.user?.id ?? 0,
        action: "DELETE_DOCUMENT",
        entityType: "Document",
        entityId: id,
        before: before as any,
        after: null
      }
    });
    return res.status(204).send();
  } catch {
    return res.status(404).json(apiError("Document not found"));
  }
});

export default router;
