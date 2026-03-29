import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireAuth, requireTreasurerOrAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notifyUser } from "../services/inAppNotifications.js";

const router = Router();

const uploadRoot = path.join(process.cwd(), "uploads", "internal-forms");
fs.mkdirSync(uploadRoot, { recursive: true });

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/webp" ||
      file.mimetype === "image/gif";
    if (!ok) return cb(new Error("Only PDF and images (JPEG, PNG, WebP, GIF) are allowed"));
    cb(null, true);
  }
});

const createBody = z
  .object({
    kind: z.enum(["REQUISITION", "GENERAL_REQUEST", "TRANSACTION_RECEIPT", "ACKNOWLEDGEMENT"]),
    title: z.string().min(1).max(300),
    description: z.string().max(8000).optional().nullable(),
    amount: z.number().nonnegative().optional().nullable(),
    currency: z.enum(["EUR", "USD", "UGX"]).optional().nullable(),
    purpose: z.string().max(500).optional().nullable(),
    vendor: z.string().max(200).optional().nullable(),
    receiptUrl: z.string().max(500).optional().nullable(),
    receiptFileName: z.string().max(255).optional().nullable()
  })
  .superRefine((data, ctx) => {
    if (data.kind === "TRANSACTION_RECEIPT") {
      const url = data.receiptUrl?.trim();
      if (!url) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Receipt attachment is required", path: ["receiptUrl"] });
      }
      if (data.amount == null || data.currency == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Amount and currency are required for expense / receipt requests",
          path: ["amount"]
        });
      }
    }
    if (data.kind === "ACKNOWLEDGEMENT") {
      const desc = data.description?.trim();
      if (!desc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Acknowledgement details are required (what you are acknowledging)",
          path: ["description"]
        });
      }
    }
  });

const decisionBody = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(2000).optional().nullable()
});

function serializeForm(row: {
  id: number;
  kind: string;
  title: string;
  description: string | null;
  amount: Prisma.Decimal | null;
  currency: string | null;
  purpose: string | null;
  vendor: string | null;
  receiptUrl: string | null;
  receiptFileName: string | null;
  status: string;
  requestedById: number;
  reviewedById: number | null;
  reviewNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requestedBy?: { id: number; email: string; director: { name: string } | null };
  reviewedBy?: { id: number; email: string } | null;
}) {
  return {
    ...row,
    amount: row.amount != null ? Number(row.amount) : null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

router.post(
  "/upload-receipt",
  requireAuth,
  (req, res, next) => {
    receiptUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json(apiError(err instanceof Error ? err.message : "Upload failed"));
      next();
    });
  },
  async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json(apiError("file required"));
    const publicUrl = `/api/uploads/internal-forms/${f.filename}`;
    return res.json({ receiptUrl: publicUrl, fileName: f.originalname });
  }
);

router.get("/", requireAuth, async (req, res) => {
  const user = req.user!;
  const status = req.query.status as string | undefined;
  const kind = req.query.kind as string | undefined;
  const mine = req.query.mine === "true" || req.query.mine === "1";

  const where: Prisma.InternalFormWhereInput = {};
  const canSeeAll =
    user.role === "ADMIN" ||
    user.role === "TREASURER" ||
    user.role === "SECRETARY" ||
    user.role === "OPERATIONAL_MANAGER" ||
    user.role === "CEO";
  if (!canSeeAll || mine) {
    where.requestedById = user.id;
  }
  if (status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
    where.status = status as Prisma.InternalFormWhereInput["status"];
  }
  if (kind && ["REQUISITION", "GENERAL_REQUEST", "TRANSACTION_RECEIPT"].includes(kind)) {
    where.kind = kind as Prisma.InternalFormWhereInput["kind"];
  }

  const rows = await prisma.internalForm.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    include: {
      requestedBy: { select: { id: true, email: true, director: { select: { name: true } } } },
      reviewedBy: { select: { id: true, email: true } }
    }
  });
  return res.json(rows.map(serializeForm));
});

router.post("/", requireAuth, validateBody(createBody), async (req, res) => {
  const user = req.user!;
  const body = req.body as z.infer<typeof createBody>;
  const data: Prisma.InternalFormCreateInput = {
    kind: body.kind,
    title: body.title,
    description: body.description ?? null,
    amount: body.amount != null ? new Prisma.Decimal(body.amount) : null,
    currency: body.currency ?? null,
    purpose: body.purpose ?? null,
    vendor: body.vendor ?? null,
    receiptUrl: body.receiptUrl?.trim() || null,
    receiptFileName: body.receiptFileName?.trim() || null,
    status: "PENDING",
    requestedBy: { connect: { id: user.id } }
  };

  const row = await prisma.internalForm.create({
    data,
    include: {
      requestedBy: { select: { id: true, email: true, director: { select: { name: true } } } },
      reviewedBy: { select: { id: true, email: true } }
    }
  });

  const treasurers = await prisma.user.findMany({ where: { role: "TREASURER" }, select: { id: true } });
  const fallbackAdmins =
    treasurers.length === 0
      ? await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })
      : [];
  const observers = await prisma.user.findMany({
    where: { role: { in: ["SECRETARY", "OPERATIONAL_MANAGER", "CEO"] } },
    select: { id: true }
  });
  const notifyIds = new Set<number>();
  for (const u of treasurers) notifyIds.add(u.id);
  for (const u of fallbackAdmins) notifyIds.add(u.id);
  for (const u of observers) notifyIds.add(u.id);
  notifyIds.delete(user.id);

  const kindLabel =
    body.kind === "REQUISITION"
      ? "Requisition"
      : body.kind === "TRANSACTION_RECEIPT"
        ? "Expense / receipt"
        : body.kind === "ACKNOWLEDGEMENT"
          ? "Acknowledgement"
          : "General request";
  const title = `New ${kindLabel}: ${body.title}`;
  const bodyText = [
    body.purpose,
    body.amount != null ? `Amount: ${body.amount} ${body.currency || ""}`.trim() : null,
    body.receiptFileName ? `Receipt: ${body.receiptFileName}` : null
  ]
    .filter(Boolean)
    .join("\n");
  for (const id of notifyIds) {
    await notifyUser(id, "INTERNAL_FORM_PENDING", title, bodyText || null, "/forms");
  }

  return res.status(201).json(serializeForm(row));
});

router.patch("/:id/decision", requireTreasurerOrAdmin, validateBody(decisionBody), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const { status, reviewNote } = req.body as z.infer<typeof decisionBody>;
  const user = req.user!;

  const existing = await prisma.internalForm.findUnique({ where: { id } });
  if (!existing) return res.status(404).json(apiError("Not found"));
  if (existing.status !== "PENDING") {
    return res.status(400).json(apiError("Only pending requests can be approved or rejected"));
  }

  const row = await prisma.internalForm.update({
    where: { id },
    data: {
      status,
      reviewedById: user.id,
      reviewNote: reviewNote ?? null,
      decidedAt: new Date()
    },
    include: {
      requestedBy: { select: { id: true, email: true, director: { select: { name: true } } } },
      reviewedBy: { select: { id: true, email: true } }
    }
  });

  await notifyUser(
    row.requestedById,
    "INTERNAL_FORM_DECIDED",
    status === "APPROVED" ? `Approved: ${row.title}` : `Rejected: ${row.title}`,
    reviewNote ?? null,
    "/forms"
  );

  return res.json(serializeForm(row));
});

router.patch("/:id/cancel", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const user = req.user!;

  const existing = await prisma.internalForm.findUnique({ where: { id } });
  if (!existing) return res.status(404).json(apiError("Not found"));
  if (existing.requestedById !== user.id) {
    return res.status(403).json(apiError("You can only cancel your own requests"));
  }
  if (existing.status !== "PENDING") {
    return res.status(400).json(apiError("Only pending requests can be cancelled"));
  }

  const row = await prisma.internalForm.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: {
      requestedBy: { select: { id: true, email: true, director: { select: { name: true } } } },
      reviewedBy: { select: { id: true, email: true } }
    }
  });
  return res.json(serializeForm(row));
});

export default router;
