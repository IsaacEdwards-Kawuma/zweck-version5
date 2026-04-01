import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { Prisma } from "@prisma/client";
import type { CrmInteractionType } from "@prisma/client";

const router = Router();

/** Mini CRM is restricted to the company secretary role. */
router.use(requireRole("SECRETARY"));

const contactBodySchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(24).optional()
});

const interactionBodySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "OTHER"]),
  title: z.string().max(300).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  meetingId: z.number().int().positive().optional().nullable()
});

const reminderBodySchema = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(20000).optional().nullable(),
  dueAt: z.string().datetime(),
  done: z.boolean().optional()
});

const linkDocSchema = z.object({
  documentId: z.number().int().positive(),
  note: z.string().max(500).optional().nullable()
});

function tagsJson(tags: string[] | undefined): Prisma.InputJsonValue {
  return (tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 24);
}

/** List contacts (not deleted). */
router.get("/contacts", async (_req, res) => {
  const rows = await prisma.crmContact.findMany({
    where: { isDeleted: false },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: {
        select: { interactions: true, reminders: true, documentLinks: true }
      }
    }
  });
  res.json(rows);
});

/** Single contact with relations. */
router.get("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const row = await prisma.crmContact.findFirst({
    where: { id, isDeleted: false },
    include: {
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 100,
        include: { meeting: { select: { id: true, title: true, date: true, time: true, status: true } } }
      },
      reminders: { orderBy: { dueAt: "asc" }, take: 100 },
      documentLinks: {
        include: {
          document: {
            select: {
              id: true,
              title: true,
              category: true,
              status: true,
              url: true,
              reviewDate: true,
              expiryDate: true,
              updatedAt: true
            }
          }
        }
      }
    }
  });
  if (!row) return res.status(404).json(apiError("Contact not found"));
  res.json(row);
});

router.post("/contacts", validateBody(contactBodySchema), async (req, res) => {
  const body = req.body as z.infer<typeof contactBodySchema>;
  const uid = req.user!.id;
  const created = await prisma.crmContact.create({
    data: {
      name: body.name.trim(),
      company: body.company?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email ?? null,
      address: body.address?.trim() || null,
      notes: body.notes ?? null,
      tags: tagsJson(body.tags),
      createdById: uid
    }
  });
  res.status(201).json(created);
});

const contactPatchSchema = contactBodySchema.partial();

router.patch("/contacts/:id", validateBody(contactPatchSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body as z.infer<typeof contactPatchSchema>;
  const existing = await prisma.crmContact.findFirst({ where: { id, isDeleted: false } });
  if (!existing) return res.status(404).json(apiError("Contact not found"));

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.company !== undefined) data.company = body.company?.trim() || null;
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.email !== undefined) data.email = body.email ?? null;
  if (body.address !== undefined) data.address = body.address?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes ?? null;
  if (body.tags !== undefined) data.tags = tagsJson(body.tags);

  if (!Object.keys(data).length) return res.status(400).json(apiError("No update fields"));
  const updated = await prisma.crmContact.update({ where: { id }, data: data as any });
  res.json(updated);
});

router.delete("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const existing = await prisma.crmContact.findFirst({ where: { id, isDeleted: false } });
  if (!existing) return res.status(404).json(apiError("Contact not found"));
  await prisma.crmContact.update({ where: { id }, data: { isDeleted: true } });
  res.json({ ok: true });
});

router.post("/contacts/:id/interactions", validateBody(interactionBodySchema), async (req, res) => {
  const contactId = Number(req.params.id);
  if (!Number.isFinite(contactId)) return res.status(400).json(apiError("Invalid contact"));
  const body = req.body as z.infer<typeof interactionBodySchema>;
  const contact = await prisma.crmContact.findFirst({ where: { id: contactId, isDeleted: false } });
  if (!contact) return res.status(404).json(apiError("Contact not found"));

  let meetingId: number | null = body.meetingId ?? null;
  if (meetingId != null) {
    const m = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m) return res.status(400).json(apiError("Meeting not found"));
  }

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  const row = await prisma.crmInteraction.create({
    data: {
      contactId,
      type: body.type as CrmInteractionType,
      title: body.title?.trim() || null,
      notes: body.notes ?? null,
      occurredAt,
      meetingId,
      createdById: req.user!.id
    },
    include: {
      meeting: { select: { id: true, title: true, date: true, time: true, status: true } }
    }
  });
  res.status(201).json(row);
});

router.delete("/interactions/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const row = await prisma.crmInteraction.findUnique({ where: { id }, include: { contact: true } });
  if (!row || row.contact.isDeleted) return res.status(404).json(apiError("Not found"));
  await prisma.crmInteraction.delete({ where: { id } });
  res.json({ ok: true });
});

router.post("/contacts/:id/reminders", validateBody(reminderBodySchema), async (req, res) => {
  const contactId = Number(req.params.id);
  if (!Number.isFinite(contactId)) return res.status(400).json(apiError("Invalid contact"));
  const body = req.body as z.infer<typeof reminderBodySchema>;
  const contact = await prisma.crmContact.findFirst({ where: { id: contactId, isDeleted: false } });
  if (!contact) return res.status(404).json(apiError("Contact not found"));

  const dueAt = new Date(body.dueAt);
  if (Number.isNaN(dueAt.getTime())) return res.status(400).json(apiError("Invalid dueAt"));

  const row = await prisma.crmReminder.create({
    data: {
      contactId,
      title: body.title.trim(),
      notes: body.notes ?? null,
      dueAt,
      done: body.done ?? false,
      doneAt: body.done ? new Date() : null,
      createdById: req.user!.id
    }
  });
  res.status(201).json(row);
});

const reminderPatchSchema = reminderBodySchema.partial();

router.patch("/reminders/:id", validateBody(reminderPatchSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body as z.infer<typeof reminderPatchSchema>;
  const row = await prisma.crmReminder.findUnique({ where: { id }, include: { contact: true } });
  if (!row || row.contact.isDeleted) return res.status(404).json(apiError("Not found"));

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.notes !== undefined) data.notes = body.notes ?? null;
  if (body.dueAt !== undefined) {
    const d = new Date(body.dueAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json(apiError("Invalid dueAt"));
    data.dueAt = d;
  }
  if (body.done !== undefined) {
    data.done = body.done;
    data.doneAt = body.done ? new Date() : null;
  }
  if (!Object.keys(data).length) return res.status(400).json(apiError("No update fields"));

  const updated = await prisma.crmReminder.update({ where: { id }, data: data as any });
  res.json(updated);
});

router.delete("/reminders/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const row = await prisma.crmReminder.findUnique({ where: { id } });
  if (!row) return res.status(404).json(apiError("Not found"));
  await prisma.crmReminder.delete({ where: { id } });
  res.json({ ok: true });
});

router.post("/contacts/:id/documents", validateBody(linkDocSchema), async (req, res) => {
  const contactId = Number(req.params.id);
  if (!Number.isFinite(contactId)) return res.status(400).json(apiError("Invalid contact"));
  const body = req.body as z.infer<typeof linkDocSchema>;
  const contact = await prisma.crmContact.findFirst({ where: { id: contactId, isDeleted: false } });
  if (!contact) return res.status(404).json(apiError("Contact not found"));
  const doc = await prisma.documentRegister.findUnique({ where: { id: body.documentId } });
  if (!doc) return res.status(400).json(apiError("Document not found"));

  try {
    const link = await prisma.crmContactDocument.create({
      data: {
        contactId,
        documentId: body.documentId,
        note: body.note?.trim() || null
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            category: true,
            status: true,
            url: true,
            reviewDate: true,
            expiryDate: true,
            updatedAt: true
          }
        }
      }
    });
    res.status(201).json(link);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return res.status(409).json(apiError("Document already linked"));
    }
    throw e;
  }
});

router.delete("/contact-documents/:linkId", async (req, res) => {
  const linkId = Number(req.params.linkId);
  if (!Number.isFinite(linkId)) return res.status(400).json(apiError("Invalid id"));
  const link = await prisma.crmContactDocument.findUnique({ where: { id: linkId }, include: { contact: true } });
  if (!link || link.contact.isDeleted) return res.status(404).json(apiError("Not found"));
  await prisma.crmContactDocument.delete({ where: { id: linkId } });
  res.json({ ok: true });
});

/** Meetings linked to this contact (via interactions). */
router.get("/contacts/:id/meetings", async (req, res) => {
  const contactId = Number(req.params.id);
  if (!Number.isFinite(contactId)) return res.status(400).json(apiError("Invalid contact"));
  const contact = await prisma.crmContact.findFirst({ where: { id: contactId, isDeleted: false } });
  if (!contact) return res.status(404).json(apiError("Contact not found"));

  const interactions = await prisma.crmInteraction.findMany({
    where: { contactId, meetingId: { not: null } },
    orderBy: { occurredAt: "desc" },
    include: {
      meeting: true
    }
  });
  const seen = new Set<number>();
  const meetings = [];
  for (const i of interactions) {
    if (i.meetingId && i.meeting && !seen.has(i.meetingId)) {
      seen.add(i.meetingId);
      meetings.push({
        interactionId: i.id,
        occurredAt: i.occurredAt,
        meeting: i.meeting
      });
    }
  }
  res.json(meetings);
});

export default router;
