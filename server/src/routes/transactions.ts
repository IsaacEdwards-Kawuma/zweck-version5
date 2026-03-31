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
import { allocateNextDirectorReceiptReference } from "../lib/directorReferenceNumbers.js";
import { notifyUser } from "../services/inAppNotifications.js";
import { deriveBalances } from "../lib/derive.js";
import { ymFromDateUtc } from "../lib/directorPosting.js";
import { generateDirectorReceiptPdfNow } from "../lib/directorReceiptPdfJob.js";

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

/** Display parts for persisted manual GL keys (concrete keys, director_capital_*, director_side_fund_*). */
function resolveStoredGlKey(
  accountKey: string,
  t: { currency?: string | null; director: { id: number; name: string } | null },
  directorCapitalCodeById: Map<number, { code: number; name: string }>
): { key: string; code: number | null; name: string } {
  const currency = t.currency && t.currency.length ? t.currency : "EUR";
  const cap = /^director_capital_(\d+)$/.exec(accountKey);
  if (cap) {
    const id = Number(cap[1]);
    const row = directorCapitalCodeById.get(id);
    const name = row?.name || (t.director?.id === id ? t.director.name : `Director ${id}`);
    return { key: accountKey, code: row?.code ?? 3110, name: `Director Capital — ${name}` };
  }
  const sf = /^director_side_fund_(\d+)$/.exec(accountKey);
  if (sf) {
    const id = Number(sf[1]);
    const row = directorCapitalCodeById.get(id);
    const label = row?.name || (t.director?.id === id ? t.director.name : "Director");
    return { key: accountKey, code: ACCOUNTS.side_fund.code, name: `Side Fund — ${label}` };
  }
  const loan = /^director_loans_receivable_(\d+)$/.exec(accountKey);
  if (loan) {
    const id = Number(loan[1]);
    const row = directorCapitalCodeById.get(id);
    const label = row?.name || (t.director?.id === id ? t.director.name : "Director");
    return {
      key: accountKey,
      code: ACCOUNTS.director_loans_receivable.code,
      name: `Director Loans Receivable — ${label}`
    };
  }
  const clear = /^director_capital_distributions_clearing_(\d+)$/.exec(accountKey);
  if (clear) {
    const id = Number(clear[1]);
    const row = directorCapitalCodeById.get(id);
    const label = row?.name || (t.director?.id === id ? t.director.name : "Director");
    return {
      key: accountKey,
      code: ACCOUNTS.directors_capital_distributions_clearing.code,
      name: `Capital Distributions Clearing — ${label}`
    };
  }
  if (accountKey === "bank") {
    if (currency === "UGX") return { key: "bank_ugx", code: 1200, name: "Cash at Bank (UGX)" };
    if (currency === "USD") return { key: "bank_usd", code: 1210, name: "Cash at Bank (USD)" };
    return { key: "bank_eur", code: 1220, name: "Cash at Bank (EUR)" };
  }
  const meta = (ACCOUNTS as Record<string, { code: number; name: string } | undefined>)[accountKey];
  if (meta) return { key: accountKey, code: meta.code, name: meta.name };
  return { key: accountKey, code: null, name: accountKey };
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
    manualDebitAccountKey: string | null;
    manualCreditAccountKey: string | null;
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
    if (accountKey === "director_loans_receivable") {
      const dirId = t.director?.id;
      if (dirId != null) {
        const row = directorCapitalCodeById.get(dirId);
        const label = row?.name || t.director?.name || "Director";
        return {
          key: `director_loans_receivable_${dirId}`,
          code: ACCOUNTS.director_loans_receivable.code,
          name: `Director Loans Receivable — ${label}`
        };
      }
      return {
        key: "director_loans_receivable",
        code: ACCOUNTS.director_loans_receivable.code,
        name: ACCOUNTS.director_loans_receivable.name
      };
    }
    if (accountKey === "directors_capital_distributions_clearing") {
      const dirId = t.director?.id;
      if (dirId != null) {
        const row = directorCapitalCodeById.get(dirId);
        const label = row?.name || t.director?.name || "Director";
        return {
          key: `director_capital_distributions_clearing_${dirId}`,
          code: ACCOUNTS.directors_capital_distributions_clearing.code,
          name: `Capital Distributions Clearing — ${label}`
        };
      }
      return {
        key: "directors_capital_distributions_clearing",
        code: ACCOUNTS.directors_capital_distributions_clearing.code,
        name: ACCOUNTS.directors_capital_distributions_clearing.name
      };
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
    manualDebitAccountKey: t.manualDebitAccountKey,
    manualCreditAccountKey: t.manualCreditAccountKey,
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

  if (t.manualDebitAccountKey && t.manualCreditAccountKey) {
    let debitParts = resolveStoredGlKey(t.manualDebitAccountKey, t, directorCapitalCodeById);
    let creditParts = resolveStoredGlKey(t.manualCreditAccountKey, t, directorCapitalCodeById);
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
    transferToAccountKey: z.string().max(40).optional(),
    manualDebitAccountKey: z.string().max(48).optional(),
    manualCreditAccountKey: z.string().max(48).optional(),
    arrearsFromMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    arrearsToMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    reason: z.string().max(500).optional(),
    distributionId: z.number().int().positive().optional()
    ,
    loanDate: z.string().datetime().optional(),
    repaymentTerms: z.string().max(800).optional(),
    loanId: z.number().int().positive().optional(),
    principalAmount: z.number().nonnegative().optional(),
    interestAmount: z.number().nonnegative().optional()
  })
  .refine((data) => validateAmountForCurrency(data.amount, data.currency), {
    message: "Amount must match currency rules (EUR/USD: max 2 decimals; UGX: whole numbers only)",
    path: ["amount"]
  });

async function validateManualLedgerKeys(
  body: z.infer<typeof postSchema>
): Promise<{ error?: string; field?: string }> {
  const debit = body.manualDebitAccountKey!.trim();
  const credit = body.manualCreditAccountKey!.trim();
  if (debit === credit) {
    return { error: "Debit and credit accounts must differ", field: "manualCreditAccountKey" };
  }
  if (debit === "bank" || credit === "bank") {
    return {
      error: "Use bank_eur, bank_usd, or bank_ugx (not the aggregate bank key).",
      field: debit === "bank" ? "manualDebitAccountKey" : "manualCreditAccountKey"
    };
  }

  async function checkKey(
    key: string,
    field: "manualDebitAccountKey" | "manualCreditAccountKey"
  ): Promise<{ error?: string; field?: string } | undefined> {
    const cap = /^director_capital_(\d+)$/.exec(key);
    const sf = /^director_side_fund_(\d+)$/.exec(key);
    const loan = /^director_loans_receivable_(\d+)$/.exec(key);
    const clear = /^director_capital_distributions_clearing_(\d+)$/.exec(key);
    if (cap || sf || loan || clear) {
      const id = Number((cap || sf || loan || clear)![1]);
      const d = await prisma.director.findUnique({ where: { id } });
      if (!d) return { error: `No director matches account key ${key}`, field };
      if (body.directorId != null && body.directorId !== id) {
        return { error: `Account ${key} requires directorId ${id}`, field: "directorId" };
      }
      if (body.directorId == null) {
        return { error: `Account ${key} requires directorId ${id}`, field: "directorId" };
      }
      return undefined;
    }
    if ((ACCOUNTS as Record<string, unknown>)[key]) return undefined;
    return { error: `Unknown account key: ${key}`, field };
  }

  const e1 = await checkKey(debit, "manualDebitAccountKey");
  if (e1) return e1;
  const e2 = await checkKey(credit, "manualCreditAccountKey");
  if (e2) return e2;
  return {};
}

async function validatePostBody(
  body: z.infer<typeof postSchema>
): Promise<{ error?: string; field?: string }> {
  const map = TX_ACCOUNT_MAP[body.type];
  if (!map) return { error: "Unknown transaction type", field: "type" };

  const hasManual =
    Boolean(body.manualDebitAccountKey?.trim()) && Boolean(body.manualCreditAccountKey?.trim());
  const partialManual =
    Boolean(body.manualDebitAccountKey?.trim() || body.manualCreditAccountKey?.trim()) && !hasManual;
  if (partialManual) {
    return {
      error: "Provide both manual debit and credit account keys, or leave both empty.",
      field: "manualDebitAccountKey"
    };
  }

  if (hasManual) {
    const mv = await validateManualLedgerKeys(body);
    if (mv.error) return mv;
  }

  if (map.needsDirector && !body.directorId) {
    return { error: "directorId is required for this transaction type", field: "directorId" };
  }

  if (body.type === "DIRECTORS_DISCIPLINARY_LEVY") {
    if (!body.reason || !body.reason.trim()) {
      return { error: "Reason is required for disciplinary levy", field: "reason" };
    }
  }

  if (body.type === "CONTRIBUTION_ARREARS") {
    if (!body.arrearsFromMonth) return { error: "From Month is required", field: "arrearsFromMonth" };
    if (!body.arrearsToMonth) return { error: "To Month is required", field: "arrearsToMonth" };
    if (body.arrearsFromMonth > body.arrearsToMonth) {
      return { error: "From Month must be before or equal to To Month", field: "arrearsFromMonth" };
    }
  }

  if (body.type === "CAPITAL_REINSTATEMENT") {
    if (!body.distributionId) return { error: "distributionId is required", field: "distributionId" };
  }

  if (body.type === "COMPANY_LOAN_TO_DIRECTOR") {
    if (!body.loanDate) return { error: "loanDate is required", field: "loanDate" };
    if (!body.repaymentTerms || !body.repaymentTerms.trim()) {
      return { error: "repaymentTerms is required", field: "repaymentTerms" };
    }
  }

  if (body.type === "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN") {
    if (!body.loanId) return { error: "loanId is required", field: "loanId" };
    if (body.principalAmount == null || body.principalAmount <= 0) {
      return { error: "principalAmount is required", field: "principalAmount" };
    }
    if (body.interestAmount != null && body.interestAmount < 0) {
      return { error: "interestAmount must be >= 0", field: "interestAmount" };
    }
    if (body.principalAmount > body.amount) {
      return { error: "principalAmount cannot exceed total amount received", field: "principalAmount" };
    }
  }

  if (body.type === "PROJECT_REVENUE" || body.type === "PROJECT_DISBURSEMENT") {
    if (!body.projectId) return { error: "projectId is required for this transaction type", field: "projectId" };
  }

  if (body.type === "INTER_ACCOUNT_TRANSFER" && !hasManual) {
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

router.get("/director-distributions", requireRole("DIRECTOR"), async (req, res) => {
  const directorId = Number(req.query.directorId);
  if (!Number.isFinite(directorId)) return res.status(400).json(apiError("Invalid directorId"));
  const rows = await prisma.directorCapitalDistribution.findMany({
    where: { directorId, status: { in: ["OPEN", "PARTIALLY_REINSTATED"] } },
    orderBy: { distributionDate: "desc" },
    select: {
      id: true,
      distributionDate: true,
      totalAmount: true,
      outstandingBalance: true,
      currency: true,
      status: true
    }
  });
  return res.json(rows);
});

router.get("/director-loans", requireRole("DIRECTOR"), async (req, res) => {
  const directorId = Number(req.query.directorId);
  if (!Number.isFinite(directorId)) return res.status(400).json(apiError("Invalid directorId"));
  const rows = await prisma.companyLoanToDirector.findMany({
    where: { directorId, status: { in: ["OPEN", "PARTIALLY_REPAID"] } },
    orderBy: { loanDate: "desc" },
    select: {
      id: true,
      loanDate: true,
      principalAmount: true,
      outstandingBalance: true,
      currency: true,
      repaymentTerms: true,
      status: true
    }
  });
  return res.json(rows);
});

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

  /** General ledger (no account filter): page by newest business date, then posting time — not oldest rows first. */
  let items: any[];
  if (accountKey) {
    const pagedChronological = allByAccount.slice(offset, offset + limit);
    items = pagedChronological.reverse();
  } else {
    const newestFirst = [...allByAccount].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (db !== da) return db - da;
      const ca = new Date(a.createdAt).getTime();
      const cb = new Date(b.createdAt).getTime();
      if (cb !== ca) return cb - ca;
      return b.id - a.id;
    });
    items = newestFirst.slice(offset, offset + limit);
  }
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
        manualDebitAccountKey: original.manualDebitAccountKey,
        manualCreditAccountKey: original.manualCreditAccountKey,
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

  await notifyUser(
    req.user!.id,
    "TX_REVERSED",
    "Transaction reversed",
    `Reference ${original.referenceNumber} was reversed.`,
    "/ledger"
  );

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

  const hasManualPosting = Boolean(body.manualDebitAccountKey?.trim() && body.manualCreditAccountKey?.trim());

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
    manualDebitAccountKey: hasManualPosting ? body.manualDebitAccountKey!.trim() : null,
    manualCreditAccountKey: hasManualPosting ? body.manualCreditAccountKey!.trim() : null,
    createdBy: req.user!.id
  };

  const sideChunk = sideFundAllocationFor(body.currency);

  function monthDiffInclusive(fromYm: string, toYm: string): number {
    const m1 = /^(\d{4})-(\d{2})$/.exec(fromYm);
    const m2 = /^(\d{4})-(\d{2})$/.exec(toYm);
    const fy = m1 ? Number(m1[1]) : NaN;
    const fm = m1 ? Number(m1[2]) : NaN;
    const ty = m2 ? Number(m2[1]) : NaN;
    const tm = m2 ? Number(m2[2]) : NaN;
    if (!Number.isFinite(fy) || !Number.isFinite(fm) || !Number.isFinite(ty) || !Number.isFinite(tm)) return 0;
    if (fm < 1 || fm > 12 || tm < 1 || tm > 12) return 0;
    return (ty - fy) * 12 + (tm - fm) + 1;
  }

  function receiptPrefixForDirectorTxType(t: TxType): "CCR" | "FNE" {
    if (t === "DIRECTORS_DISCIPLINARY_LEVY") return "FNE";
    // monthly contribution / arrears / supplementary / reinstatement all use CCR family
    return "CCR";
  }

  if (body.type === "CONTRIBUTION" && body.directorId && !hasManualPosting) {
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

    const receiptRef = await allocateNextDirectorReceiptReference({ prefix: "CCR", date: dt });
    const refSide = await allocateNextReferenceNumber();

    const mainTx = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "CCR",
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Monthly Capital Contribution",
            kind: "CONTRIBUTION",
            currency: body.currency,
            amount: body.amount,
            sideFundDeduction: sideAmount,
            capitalCredited: mainAmount,
            glReference: receiptRef
          } as any,
          createdBy: req.user!.id
        }
      });

      const tMain = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: receiptRef,
          type: "CONTRIBUTION",
          date: dt,
          amount: mainAmount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });

      await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: refSide,
          type: "SIDE_FUND",
          date: dt,
          amount: sideAmount,
          description:
            body.description ?? `Automatic side fund allocation (${sideAmount} ${body.currency}) from contribution`,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });

      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: tMain.id,
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Monthly Capital Contribution",
            kind: "CONTRIBUTION",
            currency: body.currency,
            amount: body.amount,
            sideFundDeduction: sideAmount,
            capitalCredited: mainAmount,
            glReference: receiptRef
          } as any
        }
      });

      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${receiptRef}`,
          category: "Director Transaction Receipt",
          reference: receiptRef,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: tMain.id,
          receiptReference: receiptRef,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_CONTRIBUTION_SPLIT",
          entityType: "Transaction",
          entityId: tMain.id,
          before: Prisma.JsonNull,
          after: {
            contributionAmount: mainAmount,
            sideFundAmount: sideAmount,
            directorId: body.directorId,
            currency: body.currency,
            receiptReference: receiptRef
          } as unknown as Prisma.InputJsonValue
        }
      });

      return tMain;
    });

    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${receiptRef} · ${body.amount} ${body.currency}`,
      "/ledger"
    );

    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: receiptRef }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});

    return res.status(201).json({ id: mainTx.id, referenceNumber: receiptRef });
  }

  if (body.type === "CONTRIBUTION_ARREARS" && body.directorId && !hasManualPosting) {
    const months = monthDiffInclusive(body.arrearsFromMonth!, body.arrearsToMonth!);
    if (months <= 0) {
      return res.status(400).json(apiError("Invalid month range", "arrearsFromMonth"));
    }
    const sideFundDeduction = months * sideChunk;
    if (body.amount < sideFundDeduction) {
      return res.status(400).json(
        apiError(
          `Total amount must be at least ${sideFundDeduction} ${body.currency} to cover side fund deductions for ${months} months.`,
          "amount"
        )
      );
    }

    const capitalCredited = body.amount - sideFundDeduction;
    const receiptRef = await allocateNextDirectorReceiptReference({ prefix: "CCR", date: dt });
    const refSide = await allocateNextReferenceNumber();
    const mainTx = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "CCR",
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            kind: "CONTRIBUTION_ARREARS",
            currency: body.currency,
            amount: body.amount,
            perMonthSideFund: sideChunk,
            months,
            periodCovered: `${body.arrearsFromMonth} to ${body.arrearsToMonth}`,
            sideFundDeduction,
            capitalCredited,
            glReference: receiptRef
          } as any,
          createdBy: req.user!.id
        }
      });

      const tMain = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: receiptRef,
          type: "CONTRIBUTION_ARREARS",
          date: dt,
          amount: capitalCredited,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });

      await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: refSide,
          type: "SIDE_FUND",
          date: dt,
          amount: sideFundDeduction,
          description:
            body.description ??
            `Side fund deductions (${months} months × ${sideChunk} ${body.currency}) for arrears ${body.arrearsFromMonth} to ${body.arrearsToMonth}`,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });

      await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: tMain.id,
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Contribution in Arrears",
            kind: "CONTRIBUTION_ARREARS",
            currency: body.currency,
            amount: body.amount,
            months,
            monthRange: `${body.arrearsFromMonth} to ${body.arrearsToMonth}`,
            perMonthSideFund: sideChunk,
            sideFundDeduction,
            capitalCredited,
            glReference: receiptRef
          } as any
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_CONTRIBUTION_ARREARS_SPLIT",
          entityType: "Transaction",
          entityId: tMain.id,
          before: Prisma.JsonNull,
          after: {
            directorId: body.directorId,
            currency: body.currency,
            fromMonth: body.arrearsFromMonth,
            toMonth: body.arrearsToMonth,
            months,
            totalReceived: body.amount,
            sideFundDeduction,
            capitalCredited,
            receiptReference: receiptRef
          } as unknown as Prisma.InputJsonValue
        }
      });

      return tMain;
    });

    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${receiptRef} · ${body.amount} ${body.currency}`,
      "/ledger"
    );

    // Non-blocking: generate receipt PDF (retry via cron job if it fails).
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: receiptRef }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});

    return res.status(201).json({ id: mainTx.id, referenceNumber: receiptRef });
  }

  if (body.type === "SUPPLEMENTARY_CAPITAL_CONTRIBUTION" && body.directorId && !hasManualPosting) {
    const ref = await allocateNextDirectorReceiptReference({ prefix: "CCR", date: dt });
    const tx = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "CCR",
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: { kind: "SUPPLEMENTARY_CAPITAL_CONTRIBUTION", currency: body.currency, amount: body.amount, glReference: ref } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: ref,
          type: "SUPPLEMENTARY_CAPITAL_CONTRIBUTION",
          date: dt,
          amount: body.amount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Supplementary Capital Contribution",
            kind: "SUPPLEMENTARY_CAPITAL_CONTRIBUTION",
            currency: body.currency,
            amount: body.amount,
            glReference: ref
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${ref}`,
          category: "Director Transaction Receipt",
          reference: ref,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: trow.id,
          receiptReference: ref,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_TRANSACTION",
          entityType: "Transaction",
          entityId: trow.id,
          before: Prisma.JsonNull,
          after: { ...trow, receiptReference: ref } as unknown as Prisma.InputJsonValue
        }
      });
      return trow;
    });
    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${ref} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: ref }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: tx.id, referenceNumber: ref });
  }

  if (body.type === "DIRECTORS_DISCIPLINARY_LEVY" && body.directorId && !hasManualPosting) {
    const ref = await allocateNextDirectorReceiptReference({ prefix: "FNE", date: dt });
    const tx = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "FNE",
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: { kind: "DIRECTORS_DISCIPLINARY_LEVY", currency: body.currency, amount: body.amount, reason: body.reason, glReference: ref } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: ref,
          type: "DIRECTORS_DISCIPLINARY_LEVY",
          date: dt,
          amount: body.amount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id,
          description: body.reason?.trim() || body.description || null
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Directors’ Disciplinary Levy",
            kind: "DIRECTORS_DISCIPLINARY_LEVY",
            currency: body.currency,
            amount: body.amount,
            reason: body.reason?.trim(),
            glReference: ref
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${ref}`,
          category: "Director Transaction Receipt",
          reference: ref,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: trow.id,
          receiptReference: ref,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_TRANSACTION",
          entityType: "Transaction",
          entityId: trow.id,
          before: Prisma.JsonNull,
          after: { ...trow, reason: body.reason?.trim(), receiptReference: ref } as unknown as Prisma.InputJsonValue
        }
      });
      return trow;
    });
    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${ref} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: ref }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: tx.id, referenceNumber: ref });
  }

  if (body.type === "DIRECTORS_CAPITAL_DISTRIBUTION" && body.directorId && !hasManualPosting) {
    const receiptRef = await allocateNextDirectorReceiptReference({ prefix: "WDR", date: dt });
    const bankKey = body.currency === "UGX" ? "bank_ugx" : body.currency === "USD" ? "bank_usd" : "bank_eur";
    const clearKey = `director_capital_distributions_clearing_${body.directorId}`;

    const txRow = await prisma.$transaction(async (tx) => {
      const dist = await tx.directorCapitalDistribution.create({
        data: {
          directorId: body.directorId!,
          distributionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          outstandingBalance: new Prisma.Decimal(body.amount),
          status: "OPEN",
          createdBy: req.user!.id
        }
      });

      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "WDR",
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Directors’ Capital Distribution",
            kind: "DIRECTORS_CAPITAL_DISTRIBUTION",
            currency: body.currency,
            amount: body.amount,
            distributionId: dist.id,
            outstandingBalance: body.amount,
            glReference: receiptRef
          } as any,
          createdBy: req.user!.id
        }
      });

      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: receiptRef,
          type: "DIRECTORS_CAPITAL_DISTRIBUTION",
          date: dt,
          amount: body.amount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id,
          manualDebitAccountKey: clearKey,
          manualCreditAccountKey: bankKey,
          description: body.description ?? `Directors’ capital distribution (clearing outstanding)`
        }
      });

      await tx.directorCapitalDistribution.update({
        where: { id: dist.id },
        data: { transactionBatchId: batch.id, primaryTransactionId: trow.id }
      });

      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Directors’ Capital Distribution",
            kind: "DIRECTORS_CAPITAL_DISTRIBUTION",
            currency: body.currency,
            amount: body.amount,
            outstandingBalance: body.amount,
            glReference: receiptRef
          } as any
        }
      });

      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${receiptRef}`,
          category: "Director Transaction Receipt",
          reference: receiptRef,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: trow.id,
          receiptReference: receiptRef,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });

      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_CAPITAL_DISTRIBUTION",
          entityType: "DirectorCapitalDistribution",
          entityId: dist.id,
          before: Prisma.JsonNull,
          after: { directorId: body.directorId, amount: body.amount, currency: body.currency, receiptReference: receiptRef } as unknown as Prisma.InputJsonValue
        }
      });

      return trow;
    });

    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${receiptRef} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: receiptRef }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: txRow.id, referenceNumber: receiptRef });
  }

  if (body.type === "CAPITAL_REINSTATEMENT" && body.directorId != null && body.distributionId && !hasManualPosting) {
    const directorId = body.directorId;
    const dist = await prisma.directorCapitalDistribution.findUnique({ where: { id: body.distributionId } });
    if (!dist || dist.directorId !== directorId) {
      return res.status(400).json(apiError("Invalid distribution selection", "distributionId"));
    }
    const ob = Number(dist.outstandingBalance || 0);
    if (body.amount > ob + 1e-9) {
      return res.status(400).json(apiError("Reinstatement amount exceeds outstanding balance", "amount"));
    }

    const ref = await allocateNextDirectorReceiptReference({ prefix: "CCR", date: dt });
    const bankKey = body.currency === "UGX" ? "bank_ugx" : body.currency === "USD" ? "bank_usd" : "bank_eur";
    const clearKey = `director_capital_distributions_clearing_${directorId}`;

    const reinstated = new Prisma.Decimal(body.amount);
    const nextOutstanding = new Prisma.Decimal(dist.outstandingBalance).minus(reinstated);
    const nextStatus =
      nextOutstanding.toNumber() <= 0
        ? "FULLY_REINSTATED"
        : nextOutstanding.toNumber() < new Prisma.Decimal(dist.totalAmount).toNumber()
          ? "PARTIALLY_REINSTATED"
          : "OPEN";

    const txRow = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId,
          typeKey: "CCR",
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Capital Reinstatement",
            kind: "CAPITAL_REINSTATEMENT",
            currency: body.currency,
            amount: body.amount,
            distributionId: dist.id,
            originalAmount: dist.totalAmount,
            originalDistributionDate: dist.distributionDate?.toISOString?.().slice(0, 10),
            outstandingBalance: nextOutstanding,
            glReference: ref
          } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: ref,
          type: "CAPITAL_REINSTATEMENT",
          date: dt,
          amount: body.amount,
          directorId,
          directorTransactionBatchId: batch.id,
          manualDebitAccountKey: bankKey,
          manualCreditAccountKey: clearKey,
          description: body.description ?? `Capital reinstatement against distribution #${dist.id}`
        }
      });
      await tx.directorCapitalReinstatement.create({
        data: {
          directorId,
          distributionId: dist.id,
          date: dt,
          amount: reinstated,
          currency: body.currency,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          createdBy: req.user!.id
        }
      });
      await tx.directorCapitalDistribution.update({
        where: { id: dist.id },
        data: {
          outstandingBalance: nextOutstanding,
          status: nextStatus
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Capital Reinstatement",
            kind: "CAPITAL_REINSTATEMENT",
            currency: body.currency,
            amount: body.amount,
            originalAmount: dist.totalAmount,
            originalDistributionDate: dist.distributionDate?.toISOString?.().slice(0, 10),
            outstandingBalance: nextOutstanding,
            glReference: ref
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${ref}`,
          category: "Director Transaction Receipt",
          reference: ref,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId,
          transactionId: trow.id,
          receiptReference: ref,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_CAPITAL_REINSTATEMENT",
          entityType: "DirectorCapitalDistribution",
          entityId: dist.id,
          before: { outstandingBalance: dist.outstandingBalance, status: dist.status } as any,
          after: { outstandingBalance: nextOutstanding, status: nextStatus, ref } as any
        }
      });
      return trow;
    });

    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${ref} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: ref }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: txRow.id, referenceNumber: ref });
  }

  if (body.type === "COMPANY_LOAN_TO_DIRECTOR" && body.directorId != null && !hasManualPosting) {
    const directorId = body.directorId;
    const loanDt = new Date(body.loanDate!);
    if (Number.isNaN(loanDt.getTime())) return res.status(400).json(apiError("Invalid loanDate", "loanDate"));

    // Side fund sufficiency check (best-effort based on derived balances).
    const allForDerive = await prisma.transaction.findMany({
      select: {
        type: true,
        amount: true,
        currency: true,
        directorId: true,
        postingStatus: true,
        reversalOfId: true,
        expensePaymentMode: true,
        transferFromAccountKey: true,
        transferToAccountKey: true,
        manualDebitAccountKey: true,
        manualCreditAccountKey: true
      }
    });
    const balances = deriveBalances(allForDerive as any);
    const b = balances as Record<string, number>;
    const sideFundAvailable =
      Number(b.side_fund || 0) +
      Object.entries(b)
        .filter(([k]) => /^director_side_fund_\d+$/.test(k))
        .reduce((s, [, v]) => s + Number(v || 0), 0);

    if (body.amount > sideFundAvailable + 1e-9) {
      return res
        .status(400)
        .json(
          apiError(
            `Side Fund is insufficient to cover this loan. Available Side Fund balance: ${sideFundAvailable} (derived).`,
            "amount"
          )
        );
    }

    const ref = await allocateNextDirectorReceiptReference({ prefix: "CLN", date: loanDt });
    const loanKey = `director_loans_receivable_${directorId}`;

    const tx = await prisma.$transaction(async (tx) => {
      const loan = await tx.companyLoanToDirector.create({
        data: {
          directorId,
          loanDate: loanDt,
          principalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          repaymentTerms: body.repaymentTerms!.trim(),
          reason: (body.reason || body.description || "").trim() || null,
          outstandingBalance: new Prisma.Decimal(body.amount),
          totalInterestPaid: new Prisma.Decimal(0),
          status: "OPEN",
          createdBy: req.user!.id
        }
      });
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId,
          typeKey: "CLN",
          receiptReference: ref,
          periodMonth: ymFromDateUtc(loanDt),
          transactionDate: loanDt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Company Loan to Director",
            kind: "COMPANY_LOAN_TO_DIRECTOR",
            currency: body.currency,
            amount: body.amount,
            repaymentTerms: body.repaymentTerms!.trim(),
            outstandingBalance: body.amount,
            glReference: ref
          } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: ref,
          type: "COMPANY_LOAN_TO_DIRECTOR",
          date: loanDt,
          amount: body.amount,
          directorId,
          directorTransactionBatchId: batch.id,
          manualDebitAccountKey: loanKey,
          manualCreditAccountKey: "side_fund",
          description: body.description ?? `Company loan to director (from side fund)`
        }
      });
      await tx.companyLoanToDirector.update({
        where: { id: loan.id },
        data: { primaryTransactionId: trow.id, transactionBatchId: batch.id }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: ref,
          periodMonth: ymFromDateUtc(loanDt),
          transactionDate: loanDt,
          meta: {
            receiptType: "Company Loan to Director",
            kind: "COMPANY_LOAN_TO_DIRECTOR",
            currency: body.currency,
            amount: body.amount,
            repaymentTerms: body.repaymentTerms!.trim(),
            outstandingBalance: body.amount,
            glReference: ref
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${ref}`,
          category: "Director Transaction Receipt",
          reference: ref,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId,
          transactionId: trow.id,
          receiptReference: ref,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_COMPANY_LOAN_TO_DIRECTOR",
          entityType: "CompanyLoanToDirector",
          entityId: loan.id,
          before: Prisma.JsonNull,
          after: { loanId: loan.id, directorId, amount: body.amount, currency: body.currency, ref } as any
        }
      });
      return trow;
    });

    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${ref} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: ref }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: tx.id, referenceNumber: ref });
  }

  if (body.type === "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN" && body.directorId != null && body.loanId && !hasManualPosting) {
    const directorId = body.directorId;
    const loan = await prisma.companyLoanToDirector.findUnique({ where: { id: body.loanId } });
    if (!loan || loan.directorId !== directorId) {
      return res.status(400).json(apiError("Invalid loan selection", "loanId"));
    }

    const outstanding = Number(loan.outstandingBalance || 0);
    const principal = Number(body.principalAmount || 0);
    const interest = body.interestAmount != null ? Number(body.interestAmount) : Number(body.amount) - principal;
    if (interest < -1e-9) {
      return res.status(400).json(apiError("Interest amount cannot be negative", "interestAmount"));
    }
    if (principal > outstanding + 1e-9) {
      return res.status(400).json(apiError("Principal cannot exceed outstanding loan balance", "principalAmount"));
    }

    const ref = await allocateNextDirectorReceiptReference({ prefix: "CLR", date: dt });
    const bankKey = body.currency === "UGX" ? "bank_ugx" : body.currency === "USD" ? "bank_usd" : "bank_eur";

    const nextOutstanding = new Prisma.Decimal(loan.outstandingBalance).minus(new Prisma.Decimal(principal));
    const nextStatus = nextOutstanding.toNumber() <= 0 ? "FULLY_REPAID" : "PARTIALLY_REPAID";

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId,
          typeKey: "CLR",
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Director Repayment of Company Loan",
            kind: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN",
            currency: body.currency,
            totalAmount: body.amount,
            principalAmount: principal,
            interestAmount: Math.max(0, interest),
            originalPrincipal: loan.principalAmount,
            outstandingBalance: nextOutstanding,
            glReference: ref
          } as any,
          createdBy: req.user!.id
        }
      });
      const tPrincipal = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: ref,
          type: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN",
          date: dt,
          amount: principal,
          directorId,
          directorTransactionBatchId: batch.id,
          manualDebitAccountKey: bankKey,
          manualCreditAccountKey: "side_fund",
          description: body.description ?? `Loan repayment (principal) for loan #${loan.id}`
        }
      });
      if (interest > 0) {
        await tx.transaction.create({
          data: {
            ...commonData,
            referenceNumber: await allocateNextReferenceNumber(),
            type: "INTEREST_INCOME",
            date: dt,
            amount: interest,
            directorId: null,
            directorTransactionBatchId: batch.id,
            manualDebitAccountKey: bankKey,
            manualCreditAccountKey: "income_interest",
            description: body.description ?? `Loan repayment (interest) for loan #${loan.id}`
          }
        });
      }
      await tx.companyLoanToDirectorRepayment.create({
        data: {
          directorId,
          loanId: loan.id,
          date: dt,
          totalReceived: new Prisma.Decimal(body.amount),
          principalPaid: new Prisma.Decimal(principal),
          interestPaid: new Prisma.Decimal(Math.max(0, interest)),
          currency: body.currency,
          transactionBatchId: batch.id,
          primaryTransactionId: tPrincipal.id,
          createdBy: req.user!.id
        }
      });
      await tx.companyLoanToDirector.update({
        where: { id: loan.id },
        data: {
          outstandingBalance: nextOutstanding,
          totalInterestPaid: new Prisma.Decimal(loan.totalInterestPaid).plus(new Prisma.Decimal(Math.max(0, interest))),
          status: nextStatus
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId,
          transactionBatchId: batch.id,
          primaryTransactionId: tPrincipal.id,
          receiptReference: ref,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Director Repayment of Company Loan",
            kind: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN",
            currency: body.currency,
            totalReceived: body.amount,
            principalAmount: principal,
            interestAmount: Math.max(0, interest),
            originalPrincipal: loan.principalAmount,
            outstandingBalance: nextOutstanding,
            glReference: ref
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${ref}`,
          category: "Director Transaction Receipt",
          reference: ref,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId,
          transactionId: tPrincipal.id,
          receiptReference: ref,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "CREATE_COMPANY_LOAN_REPAYMENT",
          entityType: "CompanyLoanToDirector",
          entityId: loan.id,
          before: { outstandingBalance: loan.outstandingBalance, status: loan.status } as any,
          after: { outstandingBalance: nextOutstanding, status: nextStatus, receiptReference: ref } as any
        }
      });
      return { principalTxId: tPrincipal.id };
    });

    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transactions posted",
      `Loan repayment recorded · receipt ${ref}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: ref }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ ...result, referenceNumber: ref });
  }

  if (body.type === "DIRECTOR_FEE_ALLOWANCE" && body.directorId && !hasManualPosting) {
    const receiptRef = await allocateNextDirectorReceiptReference({ prefix: "FEE", date: dt });
    const txRow = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "FEE",
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Director Fee / Allowance",
            kind: "DIRECTOR_FEE_ALLOWANCE",
            currency: body.currency,
            amount: body.amount,
            glReference: receiptRef
          } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: receiptRef,
          type: "DIRECTOR_FEE_ALLOWANCE",
          date: dt,
          amount: body.amount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Director Fee / Allowance",
            kind: "DIRECTOR_FEE_ALLOWANCE",
            currency: body.currency,
            amount: body.amount,
            glReference: receiptRef
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${receiptRef}`,
          category: "Director Transaction Receipt",
          reference: receiptRef,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: trow.id,
          receiptReference: receiptRef,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      return trow;
    });
    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${receiptRef} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: receiptRef }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: txRow.id, referenceNumber: receiptRef });
  }

  if (body.type === "DIRECTOR_LOAN_TO_COMPANY" && body.directorId && !hasManualPosting) {
    const receiptRef = await allocateNextDirectorReceiptReference({ prefix: "DLN", date: dt });
    const txRow = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "DLN",
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Director Loan to Company",
            kind: "DIRECTOR_LOAN_TO_COMPANY",
            currency: body.currency,
            amount: body.amount,
            glReference: receiptRef
          } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: receiptRef,
          type: "DIRECTOR_LOAN_TO_COMPANY",
          date: dt,
          amount: body.amount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Director Loan to Company",
            kind: "DIRECTOR_LOAN_TO_COMPANY",
            currency: body.currency,
            amount: body.amount,
            glReference: receiptRef
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${receiptRef}`,
          category: "Director Transaction Receipt",
          reference: receiptRef,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: trow.id,
          receiptReference: receiptRef,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      return trow;
    });
    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${receiptRef} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: receiptRef }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: txRow.id, referenceNumber: receiptRef });
  }

  if (body.type === "DIRECTOR_LOAN_REPAYMENT" && body.directorId && !hasManualPosting) {
    const receiptRef = await allocateNextDirectorReceiptReference({ prefix: "DLR", date: dt });
    const txRow = await prisma.$transaction(async (tx) => {
      const batch = await tx.directorTransactionBatch.create({
        data: {
          directorId: body.directorId!,
          typeKey: "DLR",
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          meta: {
            receiptType: "Director Repayment to Company",
            kind: "DIRECTOR_LOAN_REPAYMENT",
            currency: body.currency,
            amount: body.amount,
            glReference: receiptRef
          } as any,
          createdBy: req.user!.id
        }
      });
      const trow = await tx.transaction.create({
        data: {
          ...commonData,
          referenceNumber: receiptRef,
          type: "DIRECTOR_LOAN_REPAYMENT",
          date: dt,
          amount: body.amount,
          directorId: body.directorId,
          directorTransactionBatchId: batch.id
        }
      });
      const receipt = await tx.directorReceipt.create({
        data: {
          directorId: body.directorId!,
          transactionBatchId: batch.id,
          primaryTransactionId: trow.id,
          receiptReference: receiptRef,
          periodMonth: ymFromDateUtc(dt),
          transactionDate: dt,
          meta: {
            receiptType: "Director Repayment to Company",
            kind: "DIRECTOR_LOAN_REPAYMENT",
            currency: body.currency,
            amount: body.amount,
            glReference: receiptRef
          } as any
        }
      });
      await tx.documentRegister.create({
        data: {
          title: `Director Transaction Receipt — ${receiptRef}`,
          category: "Director Transaction Receipt",
          reference: receiptRef,
          owner: "Finance",
          confidentiality: "Internal",
          status: "ACTIVE",
          url: `/api/director-receipts/${receipt.id}/pdf`,
          directorId: body.directorId,
          transactionId: trow.id,
          receiptReference: receiptRef,
          createdById: req.user!.id,
          updatedById: req.user!.id
        }
      });
      return trow;
    });
    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transaction posted",
      `Reference ${receiptRef} · ${body.amount} ${body.currency}`,
      "/ledger"
    );
    void prisma.directorReceipt
      .findUnique({ where: { receiptReference: receiptRef }, select: { id: true } })
      .then((r) => (r ? generateDirectorReceiptPdfNow(r.id) : undefined))
      .catch(() => {});
    return res.status(201).json({ id: txRow.id, referenceNumber: receiptRef });
  }

  if (body.type === "RETAINED_EARNINGS_TRANSFER" && !hasManualPosting) {
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
    await notifyUser(
      req.user!.id,
      "TX_POSTED",
      "Transactions posted",
      `Retained earnings split · ${createdIds.length} parts · total ${body.amount} ${body.currency}`,
      "/ledger"
    );
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

  await notifyUser(
    req.user!.id,
    "TX_POSTED",
    "Transaction posted",
    `Reference ${ref} · ${body.amount} ${body.currency}`,
    "/ledger"
  );

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
