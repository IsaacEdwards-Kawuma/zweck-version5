import { Router } from "express";
import { Prisma, TxType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { TX_ACCOUNT_MAP } from "../lib/constants.js";

const router = Router();

const MAX_TX_LIMIT = 100_000;

function shapeTransactionRow(
  t: {
    id: number;
    type: TxType;
    date: Date;
    amount: Prisma.Decimal | number;
    description: string | null;
    director: {
      id: number;
      name: string;
      initials: string;
      avatarUrl: string | null;
    } | null;
    createdBy: number | null;
    createdAt: Date;
  }
) {
  const map = TX_ACCOUNT_MAP[t.type];
  return {
    id: t.id,
    type: t.type,
    date: t.date,
    amount: t.amount,
    description: t.description,
    director: t.director
      ? {
          id: t.director.id,
          name: t.director.name,
          initials: t.director.initials,
          avatarUrl: t.director.avatarUrl
        }
      : null,
    debitAccount: map.debit,
    creditAccount: map.credit,
    createdBy: t.createdBy,
    createdAt: t.createdAt
  };
}

const baseSchema = z.object({
  type: z.nativeEnum(TxType),
  date: z.string().datetime(),
  amount: z
    .number()
    .positive()
    .refine((n) => Math.round(n * 100) === n * 100, "Amount must have max 2 decimal places"),
  description: z.string().max(300).optional(),
  directorId: z.number().int().positive().optional()
});

const postSchema = baseSchema;
const updateSchema = baseSchema.partial().refine((val) => Object.keys(val).length > 0, {
  message: "No fields to update"
});

router.get("/", async (req, res) => {
  const { from, to, type, directorId, limit: limitRaw, offset: offsetRaw } = req.query as Record<
    string,
    string | undefined
  >;

  const where: Prisma.TransactionWhereInput = {};
  if (from || to) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.date = dateFilter;
  }
  if (type) where.type = type as TxType;
  if (directorId) {
    const n = Number(directorId);
    if (Number.isFinite(n)) where.directorId = n;
  }

  /** When omitted, return up to MAX_TX_LIMIT rows (legacy analytics); pass `limit` for paging (e.g. ledger). */
  let limit = MAX_TX_LIMIT;
  if (limitRaw !== undefined && limitRaw !== "") {
    const n = Number(limitRaw);
    if (Number.isFinite(n) && n >= 0) limit = Math.min(MAX_TX_LIMIT, Math.floor(n));
  }
  let offset = 0;
  if (offsetRaw !== undefined && offsetRaw !== "") {
    const n = Number(offsetRaw);
    if (Number.isFinite(n) && n >= 0) offset = Math.floor(n);
  }

  const [rows, total, sumAgg, groupByType] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: offset,
      take: limit,
      include: { director: true }
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({
      where,
      _sum: { amount: true },
      _count: true
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true }
    })
  ]);

  const sumAmount = sumAgg._sum.amount ? Number(sumAgg._sum.amount) : 0;
  const count = sumAgg._count;
  const byType: Record<string, number> = {};
  for (const g of groupByType) {
    byType[g.type] = g._sum.amount ? Number(g._sum.amount) : 0;
  }

  const items = rows.map((t) => shapeTransactionRow(t));

  return res.json({
    items,
    total,
    limit,
    offset,
    aggregates: {
      sumAmount,
      count,
      avgAmount: count > 0 ? sumAmount / count : 0,
      byType
    }
  });
});

router.post(
  "/",
  validateBody(postSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof postSchema>;

    const map = TX_ACCOUNT_MAP[body.type];
    const dt = new Date(body.date);
    if (Number.isNaN(dt.getTime())) return res.status(400).json(apiError("Invalid date", "date"));
    const maxFuture = Date.now() + 24 * 60 * 60 * 1000;
    if (dt.getTime() > maxFuture) return res.status(400).json(apiError("Date cannot be in the future", "date"));

    if (map.needsDirector) {
      if (!body.directorId) return res.status(400).json(apiError("directorId is required", "directorId"));
      const director = await prisma.director.findUnique({ where: { id: body.directorId } });
      if (!director) return res.status(400).json(apiError("Director not found", "directorId"));
    }

    // Business rule: for each CONTRIBUTION, automatically allocate 10 EUR to side fund
    // by splitting the original amount into:
    // - CONTRIBUTION of (amount - 10)
    // - SIDE_FUND of 10
    if (body.type === "CONTRIBUTION" && body.directorId) {
      if (body.amount <= 10) {
        return res
          .status(400)
          .json(apiError("Contribution must be greater than 10 to allocate 10 to side fund.", "amount"));
      }

      const mainAmount = body.amount - 10;
      const sideAmount = 10;

      const [mainTx, sideTx] = await prisma.$transaction([
        prisma.transaction.create({
          data: {
            type: "CONTRIBUTION",
            date: dt,
            amount: mainAmount,
            description: body.description,
            directorId: body.directorId,
            createdBy: req.user!.id
          }
        }),
        prisma.transaction.create({
          data: {
            type: "SIDE_FUND",
            date: dt,
            amount: sideAmount,
            description:
              body.description ??
              "Automatic side fund allocation (10 EUR) from contribution",
            directorId: body.directorId,
            createdBy: req.user!.id
          }
        }),
        prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "CREATE_CONTRIBUTION_SPLIT",
            entityType: "Transaction",
            entityId: 0,
            before: Prisma.JsonNull,
            after: {
              contributionAmount: mainAmount,
              sideFundAmount: sideAmount,
              directorId: body.directorId
            }
          }
        })
      ]);

      return res.status(201).json({ id: mainTx.id });
    }

    const tx = await prisma.transaction.create({
      data: {
        type: body.type,
        date: dt,
        amount: body.amount,
        description: body.description,
        directorId: body.directorId,
        createdBy: req.user!.id
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CREATE_TRANSACTION",
        entityType: "Transaction",
        entityId: tx.id,
        before: Prisma.JsonNull,
        after: tx as unknown as Prisma.InputJsonValue
      }
    });

    return res.status(201).json({ id: tx.id });
  }
);

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return res.status(404).json(apiError("Transaction not found"));

  await prisma.$transaction([
    prisma.transaction.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "DELETE_TRANSACTION",
        entityType: "Transaction",
        entityId: id,
        before: existing as unknown as Prisma.InputJsonValue,
        after: Prisma.JsonNull
      }
    })
  ]);
  return res.json({ ok: true });
});

router.put("/:id", requireRole("ADMIN"), validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return res.status(404).json(apiError("Transaction not found"));

  // To keep the contribution + side fund splitting logic consistent, we disallow
  // editing contribution transactions; the recommended flow is delete and re-post.
  if (existing.type === "CONTRIBUTION" || req.body.type === "CONTRIBUTION") {
    return res
      .status(400)
      .json(apiError("Editing contribution transactions is not supported. Delete and re-post instead.", "type"));
  }

  const body = req.body as z.infer<typeof updateSchema>;
  const data: any = {};

  if (body.date) {
    const dt = new Date(body.date);
    if (Number.isNaN(dt.getTime())) return res.status(400).json(apiError("Invalid date", "date"));
    const maxFuture = Date.now() + 24 * 60 * 60 * 1000;
    if (dt.getTime() > maxFuture) return res.status(400).json(apiError("Date cannot be in the future", "date"));
    data.date = dt;
  }

  if (typeof body.amount === "number") data.amount = body.amount;
  if (typeof body.description === "string") data.description = body.description;
  if (body.type) data.type = body.type;

  if (body.directorId !== undefined) {
    const map = body.type ? TX_ACCOUNT_MAP[body.type] : TX_ACCOUNT_MAP[existing.type];
    if (map.needsDirector) {
      const director = await prisma.director.findUnique({ where: { id: body.directorId } });
      if (!director) return res.status(400).json(apiError("Director not found", "directorId"));
      data.directorId = body.directorId;
    } else {
      data.directorId = null;
    }
  }

  const updated = await prisma.transaction.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "UPDATE_TRANSACTION",
      entityType: "Transaction",
      entityId: id,
      before: existing as unknown as Prisma.InputJsonValue,
      after: updated as unknown as Prisma.InputJsonValue
    }
  });

  return res.json(updated);
});

export default router;

