import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { generateDirectorReceiptPdfNow } from "../lib/directorReceiptPdfJob.js";
import { generateDirectorReceiptPdfNowV2 } from "../lib/directorReceiptPdfJobV2.js";

const router = Router();
const db: any = prisma;

const activeRecipientWhere = {
  isActive: true,
  deletedAt: null,
  adminBlockedAt: null,
  inAppDocumentShared: true
} as const;

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

router.get("/", requireRole("DIRECTOR"), async (req, res) => {
  // All authenticated roles (including USER) may list the documents register.
  const rows = await db.documentRegister.findMany({
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }]
  });
  return res.json(rows);
});

/**
 * Resolve a stored register URL to an actually-openable URL.
 * Primarily used for Director Transaction Receipts: prefer stored `pdfUrl` under `/api/uploads/...` or S3 public URL
 * (more reliable than JWT-only `/api/director-receipts(-v2)/:id/pdf` through proxies).
 */
router.get("/:id/resolve-url", requireRole("DIRECTOR"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid document id"));

  const doc = await db.documentRegister.findUnique({ where: { id } });
  if (!doc) return res.status(404).json(apiError("Document not found"));

  // Default: return as-is.
  let resolvedUrl: string | null = doc.url || null;

  if (doc.category === "Director Transaction Receipt") {
    const ref = String(doc.receiptReference || doc.reference || "").trim();
    if (ref) {
      // Prefer V2 receipt pdfUrl (DirectorReceipt table).
      const v2 = await prisma.directorReceipt.findUnique({
        where: { referenceNumber: ref },
        select: { id: true, pdfUrl: true }
      });
      if (v2) {
        if (!v2.pdfUrl) {
          await generateDirectorReceiptPdfNowV2(v2.id);
        }
        const again = await prisma.directorReceipt.findUnique({
          where: { referenceNumber: ref },
          select: { pdfUrl: true }
        });
        resolvedUrl = again?.pdfUrl || resolvedUrl;
      } else {
        // Legacy receipt pdfUrl (DirectorReceiptLegacy table).
        const legacy = await prisma.directorReceiptLegacy.findUnique({
          where: { receiptReference: ref },
          select: { id: true, pdfUrl: true }
        });
        if (legacy) {
          if (!legacy.pdfUrl) {
            await generateDirectorReceiptPdfNow(legacy.id);
          }
          const again = await prisma.directorReceiptLegacy.findUnique({
            where: { receiptReference: ref },
            select: { pdfUrl: true }
          });
          resolvedUrl = again?.pdfUrl || resolvedUrl;
        }
      }
    }
  }

  if (resolvedUrl && resolvedUrl !== doc.url) {
    await db.documentRegister.update({
      where: { id: doc.id },
      data: { url: resolvedUrl, updatedById: req.user?.id ?? null }
    });
  }

  return res.json({ url: resolvedUrl });
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

  const creatorId = req.user?.id ?? null;
  const recipients = await prisma.user.findMany({
    where: {
      ...(creatorId != null ? { id: { not: creatorId } } : {}),
      ...activeRecipientWhere
    },
    select: { id: true }
  });
  if (recipients.length > 0) {
    const bodyLine = [row.category && `Category: ${row.category}`, row.reference && `Ref: ${row.reference}`]
      .filter(Boolean)
      .join(" · ");
    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        type: "FILE_SHARED",
        title: `File shared: ${row.title}`,
        body: bodyLine || null,
        link: "/documents"
      }))
    });
  }

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
