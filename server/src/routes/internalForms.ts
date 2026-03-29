import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireAuth, requireTreasurerOrAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notifyUser } from "../services/inAppNotifications.js";

const router = Router();

const createBody = z.object({
  kind: z.enum(["REQUISITION", "GENERAL_REQUEST"]),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  amount: z.number().nonnegative().optional().nullable(),
  currency: z.enum(["EUR", "USD", "UGX"]).optional().nullable(),
  purpose: z.string().max(500).optional().nullable(),
  vendor: z.string().max(200).optional().nullable()
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

router.get("/", requireAuth, async (req, res) => {
  const user = req.user!;
  const status = req.query.status as string | undefined;
  const kind = req.query.kind as string | undefined;
  const mine = req.query.mine === "true" || req.query.mine === "1";

  const where: Prisma.InternalFormWhereInput = {};
  const canSeeAll = user.role === "ADMIN" || user.role === "TREASURER";
  if (!canSeeAll || mine) {
    where.requestedById = user.id;
  }
  if (status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
    where.status = status as Prisma.InternalFormWhereInput["status"];
  }
  if (kind && ["REQUISITION", "GENERAL_REQUEST"].includes(kind)) {
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
  const notifyIds = new Set<number>();
  for (const u of treasurers) notifyIds.add(u.id);
  for (const u of fallbackAdmins) notifyIds.add(u.id);
  notifyIds.delete(user.id);

  const kindLabel = body.kind === "REQUISITION" ? "Requisition" : "General request";
  const title = `New ${kindLabel}: ${body.title}`;
  const bodyText = [body.purpose, body.amount != null ? `Amount: ${body.amount} ${body.currency || ""}`.trim() : null]
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
