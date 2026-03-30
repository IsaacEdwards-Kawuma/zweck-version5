import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { writeAudit } from "../lib/audit.js";
import { Prisma } from "@prisma/client";

const router = Router();

const partyTypeSchema = z.enum(["CLIENT", "DIRECTOR", "PROJECT_PARTY"]);
const currencySchema = z.enum(["UGX", "USD", "EUR"]);

const clientSchema = z.object({
  name: z.string().min(1).max(200),
  type: partyTypeSchema,
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  currency: currencySchema.optional().default("EUR"),
  notes: z.string().max(8000).optional().nullable()
});

const updateClientSchema = clientSchema.partial();

router.get("/", async (_req, res) => {
  const rows = await prisma.client.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      email: true,
      phone: true,
      address: true,
      currency: true,
      notes: true,
      isDeleted: true,
      createdAt: true,
      createdBy: true
    }
  });
  res.json(rows);
});

router.post("/", requireRole("ADMIN"), validateBody(clientSchema), async (req, res) => {
  const body = req.body;
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.client.create({
      data: {
        name: body.name,
        type: body.type,
        email: body.email ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        currency: body.currency ?? "EUR",
        notes: body.notes ?? null,
        isDeleted: false,
        createdBy: req.user!.id
      },
      select: { id: true, name: true, type: true }
    });
    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CREATE_CLIENT",
        entityType: "Client",
        entityId: row.id,
        before: Prisma.JsonNull,
        after: row as any
      }
    });
    return row;
  });

  res.status(201).json(created);
});

router.put("/:id", requireRole("ADMIN"), validateBody(updateClientSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body;
  if (!Object.keys(body).length) return res.status(400).json(apiError("No update fields provided"));

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) return res.status(404).json(apiError("Client not found"));

  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.email !== undefined ? { email: body.email ?? null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
        ...(body.address !== undefined ? { address: body.address ?? null } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {})
      }
    });
    await writeAudit(req, { action: "UPDATE_CLIENT", entityType: "Client", entityId: id, before: null, after: body as any });
  });

  res.json({ ok: true });
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) return res.status(404).json(apiError("Client not found"));

  await prisma.client.update({ where: { id }, data: { isDeleted: true } });
  await writeAudit(req, { action: "DELETE_CLIENT", entityType: "Client", entityId: id, before: null, after: null });
  res.json({ ok: true });
});

export default router;

