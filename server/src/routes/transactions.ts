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
import { EMAIL_EVENTS, enqueueEmail } from "../services/emailBus.js";

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

function validateAmountForCurrency(amount: number, currency: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (currency === "UGX") {
    return Math.abs(amount - Math.round(amount)) < 1e-9;
  }
  const cents = Math.round(amount * 100);
  return Math.abs(amount - cents / 100) < 1e-9;
}

/** Fixed slice moved to side fund when posting a contribution (matches historical product behavior). */
function sideFundAllocationFor(currency: "EUR" | "USD" | "UGX"): number {
  if (currency === "UGX") return 10_000;
  return 10;
}

function shapeTransactionRow(
  t: {
    id: number;
    referenceNumber: string;
    externalReference: string | null;
    documentUrl: string | null;
    documentStatus: DocumentStatus;
    postingStatus: TransactionPostingStatus;
    type: TxType;
    date: Date;
    amount: Prisma.Decimal | number;
    currency?: string | null;
    description: string | null;
    expensePaymentMode: string | null;
    projectId: number | null;
    transferFromAccountKey: string | null;
    transferToAccountKey: string | null;
    reversalOfId: number | null;
    reversedByTransactionId: number | null;
    reversalReason: string | null;
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
  directorCapitalCodeById: Map<number, { code: number; name: string }>,
  postedByNameByUserId: Map<number, string>
) {
  const projectOut = t.project
    ? { id: t.project.id, code: t.project.code, name: t.project.name }
    : null;
  const map = TX_ACCOUNT_MAP[t.type];
  const currency = t.currency && t.currency.length ? t.currency : "EUR";
  const postedBy = t.createdBy != null ? postedByNameByUserId.get(t.createdBy) ?? "—" : "System";

  function resolveAccountParts(accountKey: string): { key: string; code: number | null; name: string } {
    if (accountKey === "bank") {
      if (currency === "UGX") return { key: "bank_ugx", code: 1200, name: "Cash at Bank (UGX)" };
      if (currency === "USD") return { key: "bank_usd", code: 1210, name: "Cash at Bank (USD)" };
      return { key: "bank_eur", code: 1220, name: "Cash at Bank (EUR)" };
    }
    if (accountKey === "capital") {
      const dirId = t.director?.id;
      const row = dirId != null ? directorCapitalCodeById.get(dirId) : undefined;
      if (!row) return { key: "capital", code: 3110, name: "Director Capital" };
      return { key: `director_capital_${dirId}`, code: row.code, name: `Director Capital — ${row.name}` };
    }
    if (accountKey === "side_fund") {
      const dirId = t.director?.id;
      if (dirId != null) {
        const row = directorCapitalCodeById.get(dirId);
        const label = row?.name || t.director?.name || "Director";
        return { key: `director_side_fund_${dirId}`, code: ACCOUNTS.side_fund.code, name: `Side Fund — ${label}` };
      }
      return { key: "side_fund", code: ACCOUNTS.side_fund.code, name: ACCOUNTS.side_fund.name };
    }
    const meta = (ACCOUNTS as Record<string, { code: number; name: string } | undefined>)[accountKey];
    if (!meta) return { key: accountKey, code: null, name: accountKey };
    return { key: accountKey, code: meta.code, name: meta.name };
  }

  function displayAccount(parts: { code: number | null; name: string }) {
    return parts.code != null ? `${parts.code} ${parts.name}` : parts.name;
  }

  const baseOut = {
    id: t.id,
    reference: t.referenceNumber,
    referenceNumber: t.referenceNumber,
    externalReference: t.externalReference,
    documentUrl: t.documentUrl,
    documentStatus: t.documentStatus,
    postingStatus: t.postingStatus,
    reversalOfId: t.reversalOfId,
    reversedByTransactionId: t.reversedByTransactionId,
    reversalReason: t.reversalReason,
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
    postedBy,
    createdBy: t.createdBy,
    createdAt: t.createdAt
  };

  if (!map) {
    return {
      ...baseOut,
      debitAccount: "—",
      creditAccount: "—",
      debitAccountKey: "",
      creditAccountKey: "",
      debitAccountCode: null,
      creditAccountCode: null,
      debitAccountName: "—",
      creditAccountName: "—"
    };
  }

  if (t.type === "INTER_ACCOUNT_TRANSFER") {
    const debitParts = t.transferToAccountKey
      ? resolveAccountParts(t.transferToAccountKey)
      : { key: "", code: null, name: "—" };
    const creditParts = t.transferFromAccountKey
      ? resolveAccountParts(t.transferFromAccountKey)
      : { key: "", code: null, name: "—" };
    let d = debitParts;
    let c = creditParts;
    if (t.reversalOfId) {
      const tmp = d;
      d = c;
      c = tmp;
    }
    return {
      ...baseOut,
      debitAccount: displayAccount(d),
      creditAccount: displayAccount(c),
      debitAccountKey: d.key,
      creditAccountKey: c.key,
      debitAccountCode: d.code,
      creditAccountCode: c.code,
      debitAccountName: d.name,
      creditAccountName: c.name
    };
  }

  let debitKey = map.debit;
  let creditKey = map.credit;
  if (isExpenseTxType(t.type) && t.expensePaymentMode === "ACCOUNTS_PAYABLE" && map.credit === "bank") {
    creditKey = "accounts_payable";
  } else {
    creditKey = map.credit === "bank" ? "bank" : map.credit;
  }
  debitKey = map.debit === "bank" ? "bank" : map.debit;

  let debitParts = resolveAccountParts(debitKey);
  let creditParts = resolveAccountParts(creditKey);
  if (t.reversalOfId) {
    [debitParts, creditParts] = [creditParts, debitParts];
  }

  return {
    ...baseOut,
    debitAccount: displayAccount(debitParts),
    creditAccount: displayAccount(creditParts),
    debitAccountKey: debitParts.key,
    creditAccountKey: creditParts.key,
    debitAccountCode: debitParts.code,
    creditAccountCode: creditParts.code,
    debitAccountName: debitParts.name,
    creditAccountName: creditParts.name
  };
}

function accountNormalIsDebit(accountCode: number | null | undefined): boolean {
  if (accountCode == null) return true;
  const prefix = Math.floor(Math.abs(accountCode) / 1000);
  return prefix === 1 || prefix === 5;
}

function ledgerKeyMatchesFilter(rowKey: string | null | undefined, filterKey: string): boolean {
  if (!rowKey) return false;
  if (rowKey === filterKey) return true;
  if (filterKey === "capital" && rowKey.startsWith("director_capital_")) return true;
  if (filterKey === "side_fund" && rowKey.startsWith("director_side_fund_")) return true;
  return false;
}

function ledgerRowTouchesAccount(
  row: { debitAccountKey?: string | null; creditAccountKey?: string | null },
  filterKey: string
): boolean {
  return ledgerKeyMatchesFilter(row.debitAccountKey ?? "", filterKey) || ledgerKeyMatchesFilter(row.creditAccountKey ?? "", filterKey);
}

function runningDeltaForRow(row: any, filterAccountKey: string): number {
  const amount = Number(row.amount || 0);
  const touchesDebit = ledgerKeyMatchesFilter(row.debitAccountKey, filterAccountKey);
  const touchesCredit = ledgerKeyMatchesFilter(row.creditAccountKey, filterAccountKey);
  if (!touchesDebit && !touchesCredit) return 0;
  const code = touchesDebit ? row.debitAccountCode : row.creditAccountCode;
  const debitNormal = accountNormalIsDebit(code);
  if (touchesDebit) return debitNormal ? amount : -amount;
  return debitNormal ? -amount : amount;
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

const updateSchema = z
  .object({
    date: z.string().datetime().optional(),
    amount: z.number().positive().optional(),
    description: z.string().max(300).optional(),
    directorId: z.number().int().positive().optional().nullable(),
    currency: z.enum(["EUR", "USD", "UGX"]).optional(),
    externalReference: z.string().max(200).optional().nullable(),
    documentUrl: z.string().max(500).optional().nullable(),
    documentStatus: z.nativeEnum(DocumentStatus).optional()
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "No fields to update"
  });

const reverseSchema = z.object({
  reason: z.string().trim().min(1).max(500)
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
  const { from, to, type, directorId, status, currency, accountKey, limit: limitRaw, offset: offsetRaw } = req.query as Record<
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
  if (status === "POSTED" || status === "PENDING" || status === "REVERSED") {
    where.postingStatus = status as TransactionPostingStatus;
  }
  if (status === "DOCUMENT_MISSING") {
    where.documentStatus = DocumentStatus.MISSING;
  }
  if (currency === "EUR" || currency === "USD" || currency === "UGX") {
    where.currency = currency;
  }
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

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "asc" }, { referenceNumber: "asc" }],
    include: {
      director: true,
      project: { select: { id: true, code: true, name: true } }
    }
  });
  const createdByIds = [...new Set(rows.map((t) => t.createdBy).filter((n): n is number => n != null))];
  const users = createdByIds.length
    ? await prisma.user.findMany({
        where: { id: { in: createdByIds } },
        select: { id: true, email: true, director: { select: { name: true } } }
      })
    : [];
  const postedByNameByUserId = new Map<number, string>();
  for (const u of users) {
    postedByNameByUserId.set(u.id, u.director?.name || u.email);
  }

  const shaped: any[] = rows.map((t) => shapeTransactionRow(t, directorCapitalCodeById, postedByNameByUserId));

  const allByAccount = accountKey ? shaped.filter((t) => ledgerRowTouchesAccount(t, accountKey)) : shaped;

  const balancesByAccount = new Map<string, number>();
  let openingBalance = 0;
  for (const row of allByAccount) {
    const key = accountKey || row.debitAccountKey || "";
    if (!key) continue;
    const prev = balancesByAccount.get(key) || 0;
    const next = prev + runningDeltaForRow(row, accountKey || key);
    balancesByAccount.set(key, next);
    row.runningBalance = next;
    row.runningBalanceAccountKey = key;
    const onDebit = ledgerKeyMatchesFilter(row.debitAccountKey, accountKey || key);
    row.ledgerAccountCode = onDebit ? row.debitAccountCode : row.creditAccountCode;
    row.ledgerAccountName = onDebit ? row.debitAccountName : row.creditAccountName;
    if (accountKey && row === allByAccount[0]) openingBalance = 0;
  }
  const closingBalance = accountKey ? balancesByAccount.get(accountKey) || 0 : null;

  const total = allByAccount.length;
  const pagedChronological = allByAccount.slice(offset, offset + limit);
  const items = pagedChronological.reverse();
  const sumAmount = allByAccount.reduce((s, t) => s + Number(t.amount || 0), 0);
  const count = allByAccount.length;
  const byType: Record<string, number> = {};
  for (const t of allByAccount) {
    byType[t.type] = (byType[t.type] || 0) + Number(t.amount || 0);
  }

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
    },
    openingBalance: accountKey ? openingBalance : null,
    closingBalance
  });
});

router.post("/:id/reverse", requireRole("ADMIN"), validateBody(reverseSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const { reason } = req.body as z.infer<typeof reverseSchema>;

  const original = await prisma.transaction.findUnique({
    where: { id },
    include: { reversalEntries: true }
  });
  if (!original) return res.status(404).json(apiError("Transaction not found"));
  if (original.postingStatus !== TransactionPostingStatus.POSTED) {
    return res.status(400).json(apiError("Only posted transactions can be reversed", "postingStatus"));
  }
  if (original.reversalOfId != null) {
    return res.status(400).json(apiError("Cannot reverse a reversal entry", "reversalOfId"));
  }
  if (original.reversedByTransactionId != null || original.reversalEntries.length > 0) {
    return res.status(400).json(apiError("Transaction already reversed", "reversedByTransactionId"));
  }

  const ref = await allocateNextReferenceNumber({ reversal: true });
  const now = new Date();

  const reversal = await prisma.$transaction(async (tx) => {
    const rev = await tx.transaction.create({
      data: {
        referenceNumber: ref,
        type: original.type,
        date: now,
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
        /** Must match original so derive maps the same GL lines (e.g. A/P vs bank for expenses). */
        expensePaymentMode: original.expensePaymentMode,
        projectId: original.projectId,
        transferFromAccountKey: original.transferFromAccountKey,
        transferToAccountKey: original.transferToAccountKey,
        reversalOfId: original.id,
        reversalReason: reason,
        createdBy: req.user!.id
      }
    });
    await tx.transaction.update({
      where: { id: original.id },
      data: {
        postingStatus: TransactionPostingStatus.REVERSED,
        reversedByTransactionId: rev.id
      }
    });
    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "REVERSE_TRANSACTION",
        entityType: "Transaction",
        entityId: rev.id,
        before: Prisma.JsonNull,
        after: { originalId: original.id, reversalId: rev.id, reason } as unknown as Prisma.InputJsonValue
      }
    });
    return rev;
  });

  enqueueEmail({
    type: EMAIL_EVENTS.TX_REVERSED,
    recipient: req.user!.email,
    payload: { referenceNumber: original.referenceNumber }
  });

  return res.status(201).json({
    id: reversal.id,
    referenceNumber: ref,
    originalId: original.id
  });
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const t = await prisma.transaction.findUnique({
    where: { id },
    include: {
      director: true,
      project: { select: { id: true, code: true, name: true } }
    }
  });
  if (!t) return res.status(404).json(apiError("Transaction not found"));
  const directors = await prisma.director.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true }
  });
  const directorCapitalCodeById = new Map<number, { code: number; name: string }>();
  directors.slice(0, 5).forEach((d, idx) => {
    directorCapitalCodeById.set(d.id, { code: 3110 + idx * 10, name: d.name });
  });
  const postingUser =
    t.createdBy != null
      ? await prisma.user.findUnique({
          where: { id: t.createdBy },
          select: { id: true, email: true, director: { select: { name: true } } }
        })
      : null;
  const postedByNameByUserId = new Map<number, string>();
  if (postingUser) postedByNameByUserId.set(postingUser.id, postingUser.director?.name ?? postingUser.email);
  return res.json(shapeTransactionRow(t, directorCapitalCodeById, postedByNameByUserId));
});

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
            body.description ?? `Automatic side fund allocation (${sideAmount} ${body.currency}) from contribution`,
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
          } as unknown as Prisma.InputJsonValue
        }
      })
    ]);

    enqueueEmail({
      type: EMAIL_EVENTS.TX_POSTED,
      recipient: req.user!.email,
      payload: { referenceNumber: refMain, amount: body.amount, currency: body.currency }
    });

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
          after: { total, parts: createdIds.length } as unknown as Prisma.InputJsonValue
        }
      });
    });
    enqueueEmail({
      type: EMAIL_EVENTS.TX_POSTED,
      recipient: req.user!.email,
      payload: { referenceNumber: refs[0]!, amount: body.amount, currency: body.currency }
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

  enqueueEmail({
    type: EMAIL_EVENTS.TX_POSTED,
    recipient: req.user!.email,
    payload: { referenceNumber: ref, amount: body.amount, currency: body.currency }
  });

  return res.status(201).json({ id: tx.id, referenceNumber: ref });
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: { reversalEntries: true }
  });
  if (!existing) return res.status(404).json(apiError("Transaction not found"));
  if (existing.reversalOfId != null || existing.reversedByTransactionId != null || existing.reversalEntries.length > 0) {
    return res
      .status(400)
      .json(apiError("Cannot delete a transaction that is part of a reversal pair. Reverse links must stay auditable.", "id"));
  }

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
    return res
      .status(400)
      .json(apiError("Posted transactions cannot be edited. Delete and re-post if you need to correct an amount.", "postingStatus"));
  }
  if (existing.postingStatus === TransactionPostingStatus.REVERSED || existing.reversalOfId != null) {
    return res.status(400).json(apiError("Reversal entries cannot be edited.", "postingStatus"));
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
  if (body.currency) data.currency = body.currency;
  if (body.externalReference !== undefined) data.externalReference = body.externalReference;
  if (body.documentUrl !== undefined) data.documentUrl = body.documentUrl;
  if (body.documentStatus) data.documentStatus = body.documentStatus;

  if (body.directorId !== undefined) {
    if (!body.directorId) return res.status(400).json(apiError("directorId is required", "directorId"));
    const director = await prisma.director.findUnique({ where: { id: body.directorId } });
    if (!director) return res.status(400).json(apiError("Director not found", "directorId"));
    data.directorId = body.directorId;
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

  const postingUser =
    updated.createdBy != null
      ? await prisma.user.findUnique({
          where: { id: updated.createdBy },
          select: { id: true, email: true, director: { select: { name: true } } }
        })
      : null;
  const postedByNameByUserId = new Map<number, string>();
  if (postingUser) postedByNameByUserId.set(postingUser.id, postingUser.director?.name ?? postingUser.email);

  return res.json(shapeTransactionRow(updated, directorCapitalCodeById, postedByNameByUserId));
});

export default router;
