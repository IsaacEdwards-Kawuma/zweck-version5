import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { Prisma, TxType, DocumentStatus, TransactionPostingStatus } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  ACCOUNTS,
  INTER_ACCOUNT_TRANSFER_KEYS,
  isExpenseTxType,
  TX_ACCOUNT_MAP
} from "../lib/constants.js";
import { allocateNextReferenceNumber, peekNextReferenceNumber } from "../lib/referenceNumber.js";

const router = Router();

const MAX_TX_LIMIT = 100_000;

const uploadRoot = path.join(process.cwd(), "uploads", "transactions");
fs.mkdirSync(uploadRoot, { recursive: true });

const txDocUpload = multer({
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
      file.mimetype.startsWith("image/");
    if (!ok) return cb(new Error("Only PDF and images are allowed"));
    cb(null, true);
  }
});

function sideFundAllocationFor(currency: "EUR" | "USD" | "UGX"): number {
  if (currency === "UGX") return 10_000;
  return 10;
}

function validateAmountForCurrency(amount: number, currency: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (currency === "UGX") {
    return Math.abs(amount - Math.round(amount)) < 1e-9;
  }
  const cents = Math.round(amount * 100);
  return Math.abs(amount - cents / 100) < 1e-9;
}

function shapeTransactionRow(
  t: {
    id: number;
    referenceNumber: string;
    externalReference: string | null;
    documentUrl: string | null;
    documentStatus: DocumentStatus;
    postingStatus: TransactionPostingStatus;
    reversalOfId: number | null;
    type: TxType;
    date: Date;
    amount: Prisma.Decimal | number;
    currency?: string | null;
    description: string | null;
    expensePaymentMode: string | null;
    projectId: number | null;
    transferFromAccountKey: string | null;
    transferToAccountKey: string | null;
    director: {
      id: number;
      name: string;
      initials: string;
      avatarUrl: string | null;
    } | null;
    project?: { id: number; code: string; name: string } | null;
    createdBy: number | null;
    createdAt: Date;
  },
  directorCapitalCodeById: Map<number, { code: number; name: string }>
) {
  const projectOut = t.project
    ? { id: t.project.id, code: t.project.code, name: t.project.name }
    : null;
  const map = TX_ACCOUNT_MAP[t.type];
  const currency = t.currency && t.currency.length ? t.currency : "EUR";

  function resolveBankDisplay(ccy: string) {
    if (ccy === "UGX") return "1200 Cash at Bank (UGX)";
    if (ccy === "USD") return "1210 Cash at Bank (USD)";
    return "1220 Cash at Bank (EUR)";
  }

  function resolveAccountDisplay(accountKey: string) {
    if (accountKey === "bank") return resolveBankDisplay(currency);
    if (accountKey === "capital") {
      const dirId = t.director?.id;
      const row = dirId != null ? directorCapitalCodeById.get(dirId) : undefined;
      if (!row) return "3110 Director Capital";
      return `${row.code} Director Capital — ${row.name}`;
    }
    if (accountKey === "side_fund") {
      const code = ACCOUNTS.side_fund.code;
      const name = ACCOUNTS.side_fund.name;
      if (t.director?.name) return `${code} ${name} (tagged: ${t.director.name})`;
      return `${code} ${name}`;
    }
    const meta = (ACCOUNTS as any)[accountKey] as { code: number; name: string } | undefined;
    if (!meta) return accountKey;
    return `${meta.code} ${meta.name}`;
  }

  if (!map) {
    return {
      id: t.id,
      reference: t.referenceNumber,
      referenceNumber: t.referenceNumber,
      externalReference: t.externalReference,
      documentUrl: t.documentUrl,
      documentStatus: t.documentStatus,
      postingStatus: t.postingStatus,
      reversalOfId: t.reversalOfId,
      type: t.type,
      date: t.date,
      amount: t.amount,
      currency,
      description: t.description,
      expensePaymentMode: t.expensePaymentMode,
      projectId: t.projectId,
      transferFromAccountKey: t.transferFromAccountKey,
      transferToAccountKey: t.transferToAccountKey,
      director: t.director
        ? {
            id: t.director.id,
            name: t.director.name,
            initials: t.director.initials,
            avatarUrl: t.director.avatarUrl
          }
        : null,
      project: projectOut,
      debitAccount: "—",
      creditAccount: "—",
      createdBy: t.createdBy,
      createdAt: t.createdAt
    };
  }

  let debit = map.debit;
  let credit = map.credit;
  if (t.type === "INTER_ACCOUNT_TRANSFER") {
    return {
      id: t.id,
      reference: t.referenceNumber,
      referenceNumber: t.referenceNumber,
      externalReference: t.externalReference,
      documentUrl: t.documentUrl,
      documentStatus: t.documentStatus,
      postingStatus: t.postingStatus,
      reversalOfId: t.reversalOfId,
      type: t.type,
      date: t.date,
      amount: t.amount,
      currency,
      description: t.description,
      expensePaymentMode: t.expensePaymentMode,
      projectId: t.projectId,
      transferFromAccountKey: t.transferFromAccountKey,
      transferToAccountKey: t.transferToAccountKey,
      director: t.director
        ? {
            id: t.director.id,
            name: t.director.name,
            initials: t.director.initials,
            avatarUrl: t.director.avatarUrl
          }
        : null,
      project: projectOut,
      debitAccount: t.transferToAccountKey ? resolveAccountDisplay(t.transferToAccountKey) : "—",
      creditAccount: t.transferFromAccountKey ? resolveAccountDisplay(t.transferFromAccountKey) : "—",
      createdBy: t.createdBy,
      createdAt: t.createdAt
    };
  }

  if (isExpenseTxType(t.type) && t.expensePaymentMode === "ACCOUNTS_PAYABLE") {
    credit = "accounts_payable";
  } else {
    credit = map.credit === "bank" ? "bank" : map.credit;
  }
  debit = map.debit === "bank" ? "bank" : map.debit;

  return {
    id: t.id,
    reference: t.referenceNumber,
    referenceNumber: t.referenceNumber,
    externalReference: t.externalReference,
    documentUrl: t.documentUrl,
    documentStatus: t.documentStatus,
    postingStatus: t.postingStatus,
    reversalOfId: t.reversalOfId,
    type: t.type,
    date: t.date,
    amount: t.amount,
    currency,
    description: t.description,
    expensePaymentMode: t.expensePaymentMode,
    projectId: t.projectId,
    transferFromAccountKey: t.transferFromAccountKey,
    transferToAccountKey: t.transferToAccountKey,
    director: t.director
      ? {
          id: t.director.id,
          name: t.director.name,
          initials: t.director.initials,
          avatarUrl: t.director.avatarUrl
        }
      : null,
    debitAccount: resolveAccountDisplay(debit),
    creditAccount: resolveAccountDisplay(credit),
    project: projectOut,
    createdBy: t.createdBy,
    createdAt: t.createdAt
  };
}

const postSchema = z
  .object({
    type: z.nativeEnum(TxType),
    date: z.string().datetime(),
    amount: z.number().positive(),
    description: z.string().max(300).optional(),
    directorId: z.number().int().positive().optional(),
    currency: z.enum(["EUR", "USD", "UGX"]).default("EUR"),
    externalReference: z.string().max(200).optional(),
    documentUrl: z.string().max(500).optional(),
    documentStatus: z.nativeEnum(DocumentStatus).optional(),
    expensePaymentMode: z.enum(["PAID", "ACCOUNTS_PAYABLE"]).optional(),
    projectId: z.number().int().positive().optional(),
    transferFromAccountKey: z.string().max(40).optional(),
    transferToAccountKey: z.string().max(40).optional()
  })
  .refine((data) => validateAmountForCurrency(data.amount, data.currency), {
    message: "Amount must match currency rules (EUR/USD: max 2 decimals; UGX: whole numbers only)",
    path: ["amount"]
  });

const updateSchema = z
  .object({
    type: z.nativeEnum(TxType).optional(),
    date: z.string().datetime().optional(),
    amount: z.number().positive().optional(),
    description: z.string().max(300).optional(),
    directorId: z.number().int().positive().optional().nullable(),
    currency: z.enum(["EUR", "USD", "UGX"]).optional(),
    externalReference: z.string().max(200).optional().nullable(),
    documentUrl: z.string().max(500).optional().nullable(),
    documentStatus: z.nativeEnum(DocumentStatus).optional(),
    expensePaymentMode: z.enum(["PAID", "ACCOUNTS_PAYABLE"]).optional().nullable(),
    projectId: z.number().int().positive().optional().nullable(),
    transferFromAccountKey: z.string().max(40).optional().nullable(),
    transferToAccountKey: z.string().max(40).optional().nullable()
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "No fields to update"
  });

router.get("/preview-reference", async (_req, res) => {
  const ref = await peekNextReferenceNumber();
  return res.json({ referenceNumber: ref });
});

router.post(
  "/upload-document",
  (req, res, next) => {
    txDocUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json(apiError(err instanceof Error ? err.message : "Upload failed"));
      next();
    });
  },
  async (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json(apiError("file required"));
    const publicUrl = `/api/uploads/transactions/${f.filename}`;
    return res.json({ documentUrl: publicUrl });
  }
);

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

  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true }
  });

  const directorCapitalCodeById = new Map<number, { code: number; name: string }>();
  directors.slice(0, 5).forEach((d, idx) => {
    directorCapitalCodeById.set(d.id, { code: 3110 + idx * 10, name: d.name });
  });

  const [rows, total, sumAgg, groupByType] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: offset,
      take: limit,
      include: {
        director: true,
        project: { select: { id: true, code: true, name: true } }
      }
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

  const items = rows.map((t) => shapeTransactionRow(t, directorCapitalCodeById));

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

async function validatePostBody(
  body: z.infer<typeof postSchema>
): Promise<{ error?: string; field?: string }> {
  const map = TX_ACCOUNT_MAP[body.type];
  if (!map) return { error: "Unknown transaction type", field: "type" };

  if (map.needsDirector && !body.directorId) {
    return { error: "directorId is required for this transaction type", field: "directorId" };
  }

  if (body.type === "PROJECT_REVENUE" || body.type === "PROJECT_DISBURSEMENT") {
    if (!body.projectId) return { error: "projectId is required for this transaction type", field: "projectId" };
  }

  if (body.type === "INTER_ACCOUNT_TRANSFER") {
    const from = body.transferFromAccountKey as (typeof INTER_ACCOUNT_TRANSFER_KEYS)[number] | undefined;
    const to = body.transferToAccountKey as (typeof INTER_ACCOUNT_TRANSFER_KEYS)[number] | undefined;
    if (!from || !INTER_ACCOUNT_TRANSFER_KEYS.includes(from)) {
      return { error: "transferFromAccountKey is invalid", field: "transferFromAccountKey" };
    }
    if (!to || !INTER_ACCOUNT_TRANSFER_KEYS.includes(to)) {
      return { error: "transferToAccountKey is invalid", field: "transferToAccountKey" };
    }
    if (from === to) return { error: "Source and destination must differ", field: "transferToAccountKey" };
  }

  if (isExpenseTxType(body.type)) {
    if (body.expensePaymentMode === "ACCOUNTS_PAYABLE" || body.expensePaymentMode === "PAID") {
      /* ok */
    } else if (body.expensePaymentMode != null) {
      return { error: "Invalid expense payment mode", field: "expensePaymentMode" };
    }
  } else if (body.expensePaymentMode) {
    return { error: "expensePaymentMode only applies to expense types", field: "expensePaymentMode" };
  }

  return {};
}

router.post("/", validateBody(postSchema), async (req, res) => {
  const body = req.body as z.infer<typeof postSchema>;

  const v = await validatePostBody(body);
  if (v.error) return res.status(400).json(apiError(v.error, v.field));

  const map = TX_ACCOUNT_MAP[body.type];
  const dt = new Date(body.date);
  if (Number.isNaN(dt.getTime())) return res.status(400).json(apiError("Invalid date", "date"));
  const maxFuture = Date.now() + 24 * 60 * 60 * 1000;
  if (dt.getTime() > maxFuture) return res.status(400).json(apiError("Date cannot be in the future", "date"));

  if (map.needsDirector && body.directorId) {
    const director = await prisma.director.findUnique({ where: { id: body.directorId } });
    if (!director) return res.status(400).json(apiError("Director not found", "directorId"));
  }

  if (body.projectId) {
    const p = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (!p) return res.status(400).json(apiError("Project not found", "projectId"));
  }

  const docStatus =
    body.documentUrl && body.documentUrl.length > 0
      ? DocumentStatus.ATTACHED
      : body.documentStatus === DocumentStatus.NOT_REQUIRED
        ? DocumentStatus.NOT_REQUIRED
        : DocumentStatus.MISSING;

  const commonData = {
    currency: body.currency,
    description: body.description ?? null,
    externalReference: body.externalReference ?? null,
    documentUrl: body.documentUrl ?? null,
    documentStatus: docStatus,
    postingStatus: TransactionPostingStatus.POSTED,
    expensePaymentMode:
      isExpenseTxType(body.type) && body.expensePaymentMode === "ACCOUNTS_PAYABLE"
        ? "ACCOUNTS_PAYABLE"
        : isExpenseTxType(body.type) && body.expensePaymentMode === "PAID"
          ? "PAID"
          : null,
    projectId: body.projectId ?? null,
    transferFromAccountKey: body.transferFromAccountKey ?? null,
    transferToAccountKey: body.transferToAccountKey ?? null,
    createdBy: req.user!.id
  };

  const sideChunk = sideFundAllocationFor(body.currency);

  if (body.type === "CONTRIBUTION" && body.directorId) {
    if (body.amount <= sideChunk) {
      return res.status(400).json(
        apiError(
          `Contribution must be greater than ${sideChunk} ${body.currency} to allocate the side fund slice.`,
          "amount"
        )
      );
    }

    const mainAmount = body.amount - sideChunk;
    const sideAmount = sideChunk;

    const refMain = await allocateNextReferenceNumber();
    const refSide = await allocateNextReferenceNumber();

    const [mainTx] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          ...commonData,
          referenceNumber: refMain,
          type: "CONTRIBUTION",
          date: dt,
          amount: mainAmount,
          directorId: body.directorId
        }
      }),
      prisma.transaction.create({
        data: {
          ...commonData,
          referenceNumber: refSide,
          type: "SIDE_FUND",
          date: dt,
          amount: sideAmount,
          description:
            body.description ??
            `Automatic side fund allocation (${sideAmount} ${body.currency}) from contribution`,
          directorId: body.directorId
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
            directorId: body.directorId,
            currency: body.currency
          }
        }
      })
    ]);

    return res.status(201).json({ id: mainTx.id, referenceNumber: refMain });
  }

  if (body.type === "RETAINED_EARNINGS_TRANSFER") {
    const directors = await prisma.director.findMany({
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true }
    });
    if (directors.length === 0) {
      return res.status(400).json(apiError("No directors defined for retained earnings split", "type"));
    }
    const total = body.amount;
    const n = directors.length;
    const isUgx = body.currency === "UGX";
    const base = isUgx ? Math.floor(total / n) : Math.floor((total * 100) / n) / 100;
    let remainder = isUgx ? total - base * n : Math.round((total - base * n) * 100) / 100;
    const refs: string[] = [];
    for (let i = 0; i < n; i++) refs.push(await allocateNextReferenceNumber());
    const createdIds: number[] = [];
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < n; i++) {
        const amt = i === n - 1 ? base + remainder : base;
        if (amt <= 0) continue;
        const row = await tx.transaction.create({
          data: {
            ...commonData,
            referenceNumber: refs[i]!,
            type: "RETAINED_EARNINGS_TRANSFER",
            date: dt,
            amount: amt,
            directorId: directors[i]!.id
          }
        });
        createdIds.push(row.id);
      }
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_RETAINED_EARNINGS_SPLIT",
          entityType: "Transaction",
          entityId: createdIds[0] ?? 0,
          before: Prisma.JsonNull,
          after: { total, parts: createdIds.length }
        }
      });
    });
    return res.status(201).json({ ids: createdIds, count: createdIds.length });
  }

  const ref = await allocateNextReferenceNumber();
  const tx = await prisma.transaction.create({
    data: {
      ...commonData,
      referenceNumber: ref,
      type: body.type,
      date: dt,
      amount: body.amount,
      directorId: body.directorId ?? null
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

  return res.status(201).json({ id: tx.id, referenceNumber: ref });
});

router.post("/:id/reverse", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const original = await prisma.transaction.findUnique({ where: { id } });
  if (!original) return res.status(404).json(apiError("Transaction not found"));
  if (original.postingStatus !== TransactionPostingStatus.POSTED) {
    return res.status(400).json(apiError("Only posted transactions can be reversed", "postingStatus"));
  }
  if (original.reversalOfId) {
    return res.status(400).json(apiError("Cannot reverse a reversal entry", "reversalOfId"));
  }

  const ref = await allocateNextReferenceNumber({ reversal: true });

  const reversal = await prisma.$transaction(async (tx) => {
    const rev = await tx.transaction.create({
      data: {
        referenceNumber: ref,
        type: original.type,
        date: original.date,
        amount: original.amount,
        currency: original.currency,
        description: original.description
          ? `Reversal: ${original.description}`
          : `Reversal of ${original.referenceNumber}`,
        directorId: original.directorId,
        externalReference: original.externalReference,
        documentUrl: original.documentUrl,
        documentStatus: original.documentStatus,
        postingStatus: TransactionPostingStatus.POSTED,
        reversalOfId: original.id,
        expensePaymentMode: original.expensePaymentMode,
        projectId: original.projectId,
        transferFromAccountKey: original.transferFromAccountKey,
        transferToAccountKey: original.transferToAccountKey,
        createdBy: req.user!.id
      }
    });
    await tx.transaction.update({
      where: { id: original.id },
      data: { postingStatus: TransactionPostingStatus.REVERSED }
    });
    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "REVERSE_TRANSACTION",
        entityType: "Transaction",
        entityId: rev.id,
        before: Prisma.JsonNull,
        after: { originalId: original.id, reversalId: rev.id }
      }
    });
    return rev;
  });

  return res.status(201).json({ id: reversal.id, referenceNumber: ref });
});

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

  if (existing.postingStatus === TransactionPostingStatus.POSTED) {
    return res.status(400).json(apiError("Posted transactions cannot be edited. Use reverse instead.", "postingStatus"));
  }

  if (existing.type === "CONTRIBUTION" || req.body.type === "CONTRIBUTION") {
    return res
      .status(400)
      .json(apiError("Editing contribution transactions is not supported. Delete and re-post instead.", "type"));
  }

  const body = req.body as z.infer<typeof updateSchema>;
  const data: Record<string, unknown> = {};

  const nextCurrency = body.currency ?? existing.currency;

  if (body.date) {
    const dt = new Date(body.date);
    if (Number.isNaN(dt.getTime())) return res.status(400).json(apiError("Invalid date", "date"));
    const maxFuture = Date.now() + 24 * 60 * 60 * 1000;
    if (dt.getTime() > maxFuture) return res.status(400).json(apiError("Date cannot be in the future", "date"));
    data.date = dt;
  }

  if (typeof body.amount === "number") {
    if (!validateAmountForCurrency(body.amount, nextCurrency)) {
      return res.status(400).json(apiError("Invalid amount for currency", "amount"));
    }
    data.amount = body.amount;
  } else if (body.currency && body.currency !== existing.currency) {
    if (!validateAmountForCurrency(Number(existing.amount), body.currency)) {
      return res.status(400).json(apiError("Existing amount is not valid for the new currency", "currency"));
    }
  }

  if (typeof body.description === "string") data.description = body.description;
  if (body.type) data.type = body.type;
  if (body.currency) data.currency = body.currency;
  if (body.externalReference !== undefined) data.externalReference = body.externalReference;
  if (body.documentUrl !== undefined) data.documentUrl = body.documentUrl;
  if (body.documentStatus) data.documentStatus = body.documentStatus;
  if (body.expensePaymentMode !== undefined) data.expensePaymentMode = body.expensePaymentMode;
  if (body.projectId !== undefined) data.projectId = body.projectId;
  if (body.transferFromAccountKey !== undefined) data.transferFromAccountKey = body.transferFromAccountKey;
  if (body.transferToAccountKey !== undefined) data.transferToAccountKey = body.transferToAccountKey;

  if (body.directorId !== undefined) {
    const map = body.type ? TX_ACCOUNT_MAP[body.type] : TX_ACCOUNT_MAP[existing.type];
    if (map.needsDirector) {
      if (!body.directorId) return res.status(400).json(apiError("directorId is required", "directorId"));
      const director = await prisma.director.findUnique({ where: { id: body.directorId } });
      if (!director) return res.status(400).json(apiError("Director not found", "directorId"));
      data.directorId = body.directorId;
    } else {
      data.directorId = null;
    }
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: data as Prisma.TransactionUpdateInput,
    include: {
      director: true,
      project: { select: { id: true, code: true, name: true } }
    }
  });

  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true }
  });
  const directorCapitalCodeById = new Map<number, { code: number; name: string }>();
  directors.slice(0, 5).forEach((d, idx) => {
    directorCapitalCodeById.set(d.id, { code: 3110 + idx * 10, name: d.name });
  });

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

  return res.json(shapeTransactionRow(updated, directorCapitalCodeById));
});

export default router;
