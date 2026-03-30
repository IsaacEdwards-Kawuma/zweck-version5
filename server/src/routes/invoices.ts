import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import type { InvoiceCurrency, InvoiceGlStatus, InvoiceStatus, InvoiceType } from "@prisma/client";
import { InvoiceCurrency as InvoiceCurrencyEnum } from "@prisma/client";
import { computeInvoiceLineItemTotals, computeInvoiceTotals } from "../lib/invoiceTotals.js";
import { allocateNextInvoiceNumber } from "../lib/invoiceReferenceNumber.js";
import { ACCOUNTS } from "../lib/constants.js";
import { bankKeyForCurrency } from "../lib/derive.js";
import { allocateNextReferenceNumber } from "../lib/referenceNumber.js";
import { notifyUser } from "../services/inAppNotifications.js";
import { writeAudit } from "../lib/audit.js";
import { buildInvoicePdfBuffer } from "../lib/invoicePdf.js";
import { Prisma, TransactionPostingStatus, DocumentStatus, TxType } from "@prisma/client";

const router = Router();

const invoiceTypeSchema = z.enum(["SALES", "PURCHASE", "PROFORMA", "CREDIT_NOTE"]);
const invoiceStatusSchema = z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "APPROVED"]);
const invoiceCurrencySchema = z.enum(["UGX", "USD", "EUR"]);
const invoiceGlStatusSchema = z.enum(["NOT_POSTED", "POSTED"]);

const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(2000),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  taxRate: z.number().min(0).max(100)
});

const createInvoiceSchema = z.object({
  invoiceType: invoiceTypeSchema,
  partyId: z.number().int().positive(),

  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  paymentTerms: z.string().min(1).max(200),

  currency: invoiceCurrencySchema,
  linkedProjectId: z.number().int().positive().optional().nullable(),
  linkedDirectorId: z.number().int().positive().optional().nullable(),
  glRevenueAccountKey: z.string().max(48).optional().nullable(),
  glExpenseAccountKey: z.string().max(48).optional().nullable(),

  notes: z.string().max(8000).optional().nullable(),
  documentUrl: z.string().max(500).optional().nullable(),

  reversalOfId: z.number().int().positive().optional().nullable(),
  creditNoteForId: z.number().int().positive().optional().nullable(),

  lineItems: z.array(invoiceLineItemSchema).min(1),
  // Optional: allow missing fields for draft creation; totals are computed server-side.
  // If the UI sends them, we ignore and recompute.
});

const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  lineItems: z.array(invoiceLineItemSchema).optional()
}).refine((v) => v.lineItems != null || v.invoiceType != null || v.partyId != null || v.notes != null || v.paymentTerms != null, {
  message: "No update fields provided"
});

const voidSchema = z.object({
  reason: z.string().min(1).max(500)
});

const sendSchema = z.object({
  // Empty body - GL account keys are stored on the invoice (captured during create/update).
});

const paymentSchema = z.object({
  paymentDate: z.string().datetime(),
  amount: z.number().positive(),
  currency: invoiceCurrencySchema,
  paymentMethod: z.string().min(1).max(120),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(8000).optional().nullable()
});

function validateCurrencyAmount(amount: number, currency: InvoiceCurrency): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (currency === "UGX") return Math.abs(amount - Math.round(amount)) < 1e-9;
  const cents = Math.round(amount * 100);
  return Math.abs(amount - cents / 100) < 1e-9;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(dueDate: Date) {
  const t = todayIso();
  return dueDate.toISOString().slice(0, 10) < t;
}

router.get("/", async (req, res) => {
  const {
    invoiceType,
    status,
    partyId,
    from,
    to,
    currency,
    linkedProjectId,
    linkedDirectorId,
    glStatus
  } = req.query as Record<string, string | undefined>;

  const where: any = { isDeleted: false };
  if (invoiceType) where.invoiceType = invoiceType as InvoiceType;
  if (status) where.status = status as InvoiceStatus;
  if (partyId) {
    const n = Number(partyId);
    if (Number.isFinite(n)) where.partyId = n;
  }
  if (currency) where.currency = currency as InvoiceCurrency;
  if (glStatus) where.glStatus = glStatus as InvoiceGlStatus;
  if (linkedProjectId) {
    const n = Number(linkedProjectId);
    if (Number.isFinite(n)) where.linkedProjectId = n;
  }
  if (linkedDirectorId) {
    const n = Number(linkedDirectorId);
    if (Number.isFinite(n)) where.linkedDirectorId = n;
  }
  if (from || to) {
    const d: any = {};
    if (from) d.gte = new Date(from);
    if (to) d.lte = new Date(to);
    where.invoiceDate = d;
  }

  const rows = await prisma.invoice.findMany({
    where,
    orderBy: { invoiceDate: "desc" },
    include: {
      party: { select: { id: true, name: true, type: true } },
      linkedProject: { select: { id: true, code: true, name: true } },
      linkedDirector: { select: { id: true, name: true } }
    }
  });
  return res.json(rows);
});

router.get("/metrics", async (_req, res) => {
  const now = new Date();
  const overdue = await prisma.invoice.findMany({
    where: { isDeleted: false, status: "OVERDUE" },
    select: { balanceDue: true, invoiceType: true }
  });
  const overdueCount = overdue.length;
  const overdueValue = overdue.reduce((s, r) => s + Number(r.balanceDue || 0), 0);

  const sales = await prisma.invoice.aggregate({
    where: { isDeleted: false, invoiceType: "SALES", status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
    _sum: { balanceDue: true }
  });
  const purchases = await prisma.invoice.aggregate({
    where: { isDeleted: false, invoiceType: "PURCHASE", status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
    _sum: { balanceDue: true }
  });

  return res.json({
    totalReceivable: Number(sales._sum.balanceDue) || 0,
    totalPayable: Number(purchases._sum.balanceDue) || 0,
    overdueCount,
    overdueValue,
    asOf: now.toISOString()
  });
});

router.get("/:id/pdf", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const invoice = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    include: {
      party: true,
      lineItems: { orderBy: { id: "asc" } },
      payments: { orderBy: { paymentDate: "desc" } },
      linkedProject: { select: { code: true, name: true } },
      linkedDirector: { select: { name: true } }
    }
  });

  if (!invoice) return res.status(404).json(apiError("Invoice not found"));

  try {
    const buf = await buildInvoicePdfBuffer(invoice);
    const safeName = invoice.invoiceNumber.replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    return res.send(buf);
  } catch (e) {
    return res.status(500).json(apiError(e instanceof Error ? e.message : "PDF generation failed"));
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const invoice = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    include: {
      party: true,
      lineItems: true,
      payments: { orderBy: { paymentDate: "desc" } },
      glTransactions: {
        where: { postingStatus: TransactionPostingStatus.POSTED },
        orderBy: { date: "desc" },
        select: {
          id: true,
          referenceNumber: true,
          type: true,
          date: true,
          amount: true,
          currency: true,
          description: true,
          documentUrl: true,
          manualDebitAccountKey: true,
          manualCreditAccountKey: true
        }
      }
    }
  });

  if (!invoice) return res.status(404).json(apiError("Invoice not found"));
  return res.json(invoice);
});

router.post("/", requireRole("ADMIN"), validateBody(createInvoiceSchema), async (req, res) => {
  const body = req.body;

  const invoiceDate = new Date(body.invoiceDate);
  const dueDate = new Date(body.dueDate);
  if (Number.isNaN(invoiceDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    return res.status(400).json(apiError("Invalid invoice/due date"));
  }
  if (dueDate.getTime() < invoiceDate.getTime()) return res.status(400).json(apiError("Due date cannot be before invoice date", "dueDate"));

  // Validate invoice party exists (soft-deleted clients are not allowed).
  const party = await prisma.client.findUnique({ where: { id: body.partyId }, select: { id: true, isDeleted: true } });
  if (!party || party.isDeleted) return res.status(400).json(apiError("Party not found", "partyId"));

  const creditNoteFor =
    body.invoiceType === "CREDIT_NOTE" && body.creditNoteForId
      ? await prisma.invoice.findUnique({ where: { id: body.creditNoteForId, isDeleted: false }, select: { id: true, invoiceType: true, status: true, totalAmount: true } })
      : null;
  if (body.invoiceType === "CREDIT_NOTE") {
    if (!body.creditNoteForId || !creditNoteFor) return res.status(400).json(apiError("creditNoteForId must reference a valid sales invoice", "creditNoteForId"));
    if (creditNoteFor.invoiceType !== "SALES") return res.status(400).json(apiError("Credit note can only reference a SALES invoice", "creditNoteForId"));
    if (!["PAID", "PARTIALLY_PAID"].includes(String(creditNoteFor.status))) return res.status(400).json(apiError("Credit note can only be raised against PAID/PARTIALLY_PAID sales invoices", "creditNoteForId"));
  }

  if (body.invoiceType === "SALES" || body.invoiceType === "PROFORMA" || body.invoiceType === "CREDIT_NOTE") {
    if (!body.glRevenueAccountKey) return res.status(400).json(apiError("glRevenueAccountKey is required for SALES/PROFORMA/CREDIT_NOTE", "glRevenueAccountKey"));
  }
  if (body.invoiceType === "PURCHASE") {
    if (!body.glExpenseAccountKey) return res.status(400).json(apiError("glExpenseAccountKey is required for PURCHASE", "glExpenseAccountKey"));
  }

  // Compute line totals
  const lineItemsComputed = body.lineItems.map((li: z.infer<typeof invoiceLineItemSchema>) => {
    const computed = computeInvoiceLineItemTotals(
      { quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate },
      body.currency
    );
    return {
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      taxRate: li.taxRate,
      ...computed
    };
  });

  const totals = computeInvoiceTotals(
    body.lineItems.map((li: z.infer<typeof invoiceLineItemSchema>) => ({ quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate })),
    body.currency
  );

  if (body.invoiceType === "CREDIT_NOTE" && creditNoteFor) {
    if (totals.totalAmount > Number(creditNoteFor.totalAmount) + 1e-9) {
      return res.status(400).json(apiError("Credit note total cannot exceed original invoice total", "lineItems"));
    }
  }

  const invoiceNumber = await allocateNextInvoiceNumber(body.invoiceType as InvoiceType, invoiceDate);

  const created = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceType: body.invoiceType,
        status: "DRAFT",
        invoiceDate,
        dueDate,
        partyId: body.partyId,
        currency: body.currency as InvoiceCurrency,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid: 0,
        balanceDue: totals.totalAmount,
        paymentTerms: body.paymentTerms,
        notes: body.notes ?? null,
        linkedProjectId: body.linkedProjectId ?? null,
        linkedDirectorId: body.linkedDirectorId ?? null,
        documentUrl: body.documentUrl ?? null,
        glStatus: "NOT_POSTED",
        glRevenueAccountKey: body.glRevenueAccountKey ?? null,
        glExpenseAccountKey: body.glExpenseAccountKey ?? null,
        reversalOfId: body.reversalOfId ?? null,
        creditNoteForId: body.creditNoteForId ?? null,
        createdBy: req.user!.id
      },
      select: { id: true }
    });

    await tx.invoiceLineItem.createMany({
      data: lineItemsComputed.map((li: any) => ({
        invoiceId: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate,
        taxAmount: li.taxAmount,
        subtotal: li.subtotal,
        total: li.total
      }))
    });

    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "CREATE_INVOICE",
        entityType: "Invoice",
        entityId: invoice.id,
        before: Prisma.JsonNull,
        after: { invoiceNumber, invoiceType: body.invoiceType, totalAmount: totals.totalAmount } as any
      }
    });

    return invoice;
  });

  res.status(201).json(created);
});

router.put("/:id", requireRole("ADMIN"), validateBody(updateInvoiceSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body;

  const existing = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, status: true }
  });
  if (!existing) return res.status(404).json(apiError("Invoice not found"));
  if (existing.status !== "DRAFT") return res.status(400).json(apiError("Only DRAFT invoices can be edited", "status"));

  // For simplicity: if lineItems is provided, recompute and overwrite them.
  const nextCurrency = (body.currency ?? null) as InvoiceCurrency | null;
  const currency = (body.currency ?? (await prisma.invoice.findUnique({ where: { id } }).then((x) => x?.currency))) as InvoiceCurrency;

  const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : null;
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;

  if (invoiceDate && dueDate && dueDate.getTime() < invoiceDate.getTime()) {
    return res.status(400).json(apiError("Due date cannot be before invoice date", "dueDate"));
  }

  const lineItems = body.lineItems ? body.lineItems : null;
  const totals =
    lineItems && currency
      ? computeInvoiceTotals(lineItems.map((li: z.infer<typeof invoiceLineItemSchema>) => ({ quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate })), currency)
      : null;

  await prisma.$transaction(async (tx) => {
    if (body.lineItems) {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      if (!lineItems?.length) throw new Error("lineItems required");
      const computed = lineItems.map((li: z.infer<typeof invoiceLineItemSchema>) => {
        const c = computeInvoiceLineItemTotals({ quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate }, currency);
        return {
          invoiceId: id,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          taxRate: li.taxRate,
          taxAmount: c.taxAmount,
          subtotal: c.subtotal,
          total: c.total
        };
      });
      await tx.invoiceLineItem.createMany({ data: computed });
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        invoiceType: body.invoiceType ?? undefined,
        partyId: body.partyId ?? undefined,
        invoiceDate: invoiceDate ?? undefined,
        dueDate: dueDate ?? undefined,
        paymentTerms: body.paymentTerms ?? undefined,
        currency: body.currency ?? undefined,
        notes: body.notes ?? undefined,
        documentUrl: body.documentUrl ?? undefined,
        linkedProjectId: body.linkedProjectId ?? undefined,
        linkedDirectorId: body.linkedDirectorId ?? undefined,
        glRevenueAccountKey: body.glRevenueAccountKey ?? undefined,
        glExpenseAccountKey: body.glExpenseAccountKey ?? undefined,
        reversalOfId: body.reversalOfId ?? undefined,
        creditNoteForId: body.creditNoteForId ?? undefined,
        ...(totals
          ? {
              subtotal: totals.subtotal,
              taxAmount: totals.taxAmount,
              totalAmount: totals.totalAmount,
              balanceDue: totals.totalAmount,
              amountPaid: 0
            }
          : null)
      }
    });
    void updated;
    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "UPDATE_INVOICE",
        entityType: "Invoice",
        entityId: id,
        before: Prisma.JsonNull,
        after: body as any
      }
    });
  });

  res.json({ ok: true });
});

router.post("/:id/send", requireRole("ADMIN"), validateBody(sendSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const invoice = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    include: { lineItems: true }
  });
  if (!invoice) return res.status(404).json(apiError("Invoice not found"));
  if (invoice.status !== "DRAFT") return res.status(400).json(apiError("Only DRAFT invoices can be sent", "status"));
  if (!invoice.lineItems.length) return res.status(400).json(apiError("Invoice cannot be sent without at least one line item", "lineItems"));

  const accountKeysOk = () => {
    if (invoice.invoiceType === "SALES" || invoice.invoiceType === "PROFORMA") return Boolean(invoice.glRevenueAccountKey);
    if (invoice.invoiceType === "PURCHASE") return Boolean(invoice.glExpenseAccountKey);
    if (invoice.invoiceType === "CREDIT_NOTE") return true;
    return true;
  };
  if (!accountKeysOk()) return res.status(400).json(apiError("Missing GL account selection", "gl"));

  const invDate = invoice.invoiceDate;

  await prisma.$transaction(async (tx) => {
    if (invoice.invoiceType === "PROFORMA") {
      await tx.invoice.update({
        where: { id },
        data: { status: "SENT", glStatus: "NOT_POSTED" }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "SEND_INVOICE",
          entityType: "Invoice",
          entityId: id,
          before: Prisma.JsonNull,
          after: { status: "SENT" } as any
        }
      });
      return;
    }

    // Post GL entries for SALES/PURCHASE/CREDIT_NOTE when raised.
    let manualDebitAccountKey: string;
    let manualCreditAccountKey: string;
    let txType: TxType;
    const amount = invoice.totalAmount;
    const currency = invoice.currency;

    if (invoice.invoiceType === "SALES") {
      manualDebitAccountKey = "accounts_receivable";
      manualCreditAccountKey = invoice.glRevenueAccountKey || "";
      txType = "PROJECT_REVENUE";
    } else if (invoice.invoiceType === "PURCHASE") {
      manualDebitAccountKey = invoice.glExpenseAccountKey || "";
      manualCreditAccountKey = "accounts_payable";
      txType = "REGISTRATION";
    } else {
      // CREDIT_NOTE
      const original = invoice.creditNoteForId
        ? await tx.invoice.findUnique({ where: { id: invoice.creditNoteForId } })
        : null;
      if (!original || original.invoiceType !== "SALES") throw new Error("creditNoteForId invalid");

      manualDebitAccountKey = original.glRevenueAccountKey || "";
      manualCreditAccountKey = "accounts_receivable";
      txType = "OTHER_INCOME";
    }

    if (!manualDebitAccountKey || !manualCreditAccountKey) throw new Error("GL account keys missing");
    if (!(manualDebitAccountKey in ACCOUNTS)) throw new Error(`Unknown debit key ${manualDebitAccountKey}`);
    if (!(manualCreditAccountKey in ACCOUNTS)) throw new Error(`Unknown credit key ${manualCreditAccountKey}`);

    const description = `${invoice.invoiceType.replaceAll("_", " ")} ${invoice.invoiceNumber} — Total ${amount} ${currency}`;

    const ref = await allocateNextReferenceNumber();
    const docStatus = invoice.documentUrl ? DocumentStatus.ATTACHED : DocumentStatus.MISSING;
    await tx.transaction.create({
      data: {
        type: txType,
        date: invDate,
        amount,
        currency: currency as any,
        description,
        directorId: invoice.linkedDirectorId ?? null,
        projectId: invoice.linkedProjectId ?? null,
        referenceNumber: ref,
        externalReference: invoice.invoiceNumber,
        documentUrl: invoice.documentUrl ?? null,
        documentStatus: docStatus,
        postingStatus: TransactionPostingStatus.POSTED,
        manualDebitAccountKey,
        manualCreditAccountKey,
        invoiceId: invoice.id,
        invoicePaymentId: null,
        createdBy: req.user!.id
      }
    });

    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "SEND_INVOICE",
        entityType: "Invoice",
        entityId: invoice.id,
        before: Prisma.JsonNull,
        after: { status: "SENT", totalAmount: amount } as any
      }
    });

    // Update invoice totals and status based on whether there are payments already (rare for DRAFT -> SENT).
    const status: InvoiceStatus =
      invoice.amountPaid > 0
        ? invoice.balanceDue <= 0
          ? "PAID"
          : invoice.balanceDue > 0
            ? isOverdue(invoice.dueDate) ? "OVERDUE" : "PARTIALLY_PAID"
            : "SENT"
        : "SENT";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status, glStatus: "POSTED" }
    });
  });

  return res.json({ ok: true });
});

router.post("/:id/payments", requireRole("ADMIN"), validateBody(paymentSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const invoice = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    include: { payments: true }
  });
  if (!invoice) return res.status(404).json(apiError("Invoice not found"));
  if (!["SENT", "PARTIALLY_PAID", "OVERDUE", "PAID"].includes(invoice.status)) {
    // allow payments only after sent
    return res.status(400).json(apiError("Payments can only be added after invoice is sent", "status"));
  }
  if (invoice.status === "PAID") return res.status(400).json(apiError("Invoice is already PAID", "status"));

  if (paymentSchema.safeParse(req.body).success === false) {
    return res.status(400).json(apiError("Invalid payment"));
  }
  const body = req.body as z.infer<typeof paymentSchema>;
  if (body.currency !== invoice.currency) return res.status(400).json(apiError("Payment currency must match invoice currency", "currency"));
  if (!validateCurrencyAmount(body.amount, invoice.currency as any)) return res.status(400).json(apiError("Invalid payment amount for currency", "amount"));

  const balanceDue = Number(invoice.balanceDue) || 0;
  if (body.amount > balanceDue + 1e-9) return res.status(400).json(apiError("Payment amount cannot exceed balance due", "amount"));

  const description = `Invoice ${invoice.invoiceNumber} — Payment ${body.reference || ""}`.trim();

  await prisma.$transaction(async (tx) => {
    const payment = await tx.invoicePayment.create({
      data: {
        invoiceId: invoice.id,
        paymentDate: new Date(body.paymentDate),
        amount: body.amount,
        currency: body.currency,
        paymentMethod: body.paymentMethod,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
        glStatus: "POSTED",
        createdBy: req.user!.id
      }
    });

    // Post payment GL via manual ledger keys.
    const ref = await allocateNextReferenceNumber();
    const docStatus = invoice.documentUrl ? DocumentStatus.ATTACHED : DocumentStatus.MISSING;

    const bankKey = bankKeyForCurrency(invoice.currency);
    let manualDebitAccountKey: string;
    let manualCreditAccountKey: string;
    let txType: TxType;

    if (invoice.invoiceType === "SALES") {
      manualDebitAccountKey = bankKey;
      manualCreditAccountKey = "accounts_receivable";
      txType = "OTHER_INCOME";
    } else if (invoice.invoiceType === "PURCHASE") {
      // Payment reduces A/P
      manualDebitAccountKey = "accounts_payable";
      manualCreditAccountKey = bankKey;
      txType = "OTHER_OUT";
    } else {
      // Proforma / Credit note payments not supported in this MVP
      throw new Error("Payments only supported for SALES/PURCHASE invoices");
    }

    await tx.transaction.create({
      data: {
        type: txType,
        date: new Date(body.paymentDate),
        amount: body.amount,
        currency: invoice.currency,
        description: `${description} · ${body.amount} ${invoice.currency}`,
        directorId: invoice.linkedDirectorId ?? null,
        projectId: invoice.linkedProjectId ?? null,
        referenceNumber: ref,
        externalReference: body.reference ?? invoice.invoiceNumber,
        documentUrl: invoice.documentUrl ?? null,
        documentStatus: docStatus,
        postingStatus: TransactionPostingStatus.POSTED,
        manualDebitAccountKey,
        manualCreditAccountKey,
        invoiceId: invoice.id,
        invoicePaymentId: payment.id,
        createdBy: req.user!.id
      }
    });

    const paymentsAgg = await tx.invoicePayment.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
    const amountPaid = Number(paymentsAgg._sum.amount) || 0;
    const newBalanceDue = invoice.totalAmount - amountPaid;

    const nextStatus: InvoiceStatus =
      newBalanceDue <= 0
        ? "PAID"
        : invoice.dueDate.toISOString().slice(0, 10) < todayIso()
          ? "OVERDUE"
          : amountPaid > 0
            ? "PARTIALLY_PAID"
            : "SENT";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid,
        balanceDue: newBalanceDue,
        status: nextStatus,
        glStatus: "POSTED"
      }
    });
  });

  return res.json({ ok: true });
});

router.post("/:id/void", requireRole("ADMIN"), validateBody(voidSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body as z.infer<typeof voidSchema>;

  const invoice = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    include: { payments: true }
  });
  if (!invoice) return res.status(404).json(apiError("Invoice not found"));

  if (invoice.status === "PAID") {
    return res.status(400).json(apiError("PAID invoices cannot be voided. Please raise a Credit Note instead."));
  }
  if (!["DRAFT", "SENT"].includes(invoice.status)) {
    return res.status(400).json(apiError("Only DRAFT or SENT invoices can be voided", "status"));
  }

  if (!body.reason || !body.reason.trim()) return res.status(400).json(apiError("Void reason is mandatory", "reason"));

  await prisma.$transaction(async (tx) => {
    // If invoice had GL, reverse linked transactions.
    const hadGL = invoice.glStatus === "POSTED";

    if (hadGL) {
      const linked = await tx.transaction.findMany({ where: { invoiceId: invoice.id }, select: { id: true } });
      for (const row of linked) {
        const original = await tx.transaction.findUnique({ where: { id: row.id }, include: { reversalEntries: true } });
        if (!original) continue;
        if (original.postingStatus !== TransactionPostingStatus.POSTED) continue;
        if (original.reversalOfId != null) continue;
        if (original.reversedByTransactionId != null || original.reversalEntries.length > 0) continue;

        const ref = await allocateNextReferenceNumber({ reversal: true });
        const now = new Date();
        const rev = await tx.transaction.create({
          data: {
            referenceNumber: ref,
            type: original.type,
            date: now,
            amount: original.amount,
            currency: original.currency,
            description: original.description ? `Reversal: ${original.description}` : `Reversal of ${original.referenceNumber}`,
            directorId: original.directorId,
            externalReference: original.externalReference,
            documentUrl: original.documentUrl,
            documentStatus: original.documentStatus,
            postingStatus: TransactionPostingStatus.POSTED,
            expensePaymentMode: original.expensePaymentMode,
            projectId: original.projectId,
            transferFromAccountKey: original.transferFromAccountKey,
            transferToAccountKey: original.transferToAccountKey,
            manualDebitAccountKey: original.manualDebitAccountKey,
            manualCreditAccountKey: original.manualCreditAccountKey,
            reversalOfId: original.id,
            reversalReason: body.reason,
            createdBy: req.user!.id,
            invoiceId: original.invoiceId,
            invoicePaymentId: original.invoicePaymentId
          }
        });

        await tx.transaction.update({
          where: { id: original.id },
          data: { postingStatus: TransactionPostingStatus.REVERSED, reversedByTransactionId: rev.id }
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "REVERSE_TRANSACTION",
            entityType: "Transaction",
            entityId: rev.id,
          before: Prisma.JsonNull,
            after: { originalId: original.id, reversalId: rev.id, reason: body.reason } as any
          }
        });
      }
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "VOID", voidReason: body.reason }
    });

    await tx.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VOID_INVOICE",
        entityType: "Invoice",
        entityId: invoice.id,
        before: Prisma.JsonNull,
        after: { reason: body.reason } as any
      }
    });
  });

  return res.json({ ok: true });
});

// Proforma approval -> (no GL) mark APPROVED
router.post("/:id/proforma/approve", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const invoice = await prisma.invoice.findUnique({ where: { id, isDeleted: false }, include: { lineItems: true } });
  if (!invoice) return res.status(404).json(apiError("Invoice not found"));
  if (invoice.invoiceType !== "PROFORMA") return res.status(400).json(apiError("Not a Proforma invoice"));
  if (invoice.status !== "SENT") return res.status(400).json(apiError("Only SENT proformas can be approved", "status"));

  // Move status to APPROVED (UI then allows conversion).
  await prisma.invoice.update({ where: { id }, data: { status: "APPROVED" } });
  await writeAudit(req, { action: "APPROVE_PROFORMA", entityType: "Invoice", entityId: id, before: null, after: { status: "APPROVED" } });
  return res.json({ ok: true });
});

// Convert approved proforma -> Sales invoice (posts GL)
router.post("/:id/proforma/convert", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));

  const proforma = await prisma.invoice.findUnique({
    where: { id, isDeleted: false },
    include: { lineItems: true }
  });
  if (!proforma) return res.status(404).json(apiError("Proforma not found"));
  if (proforma.invoiceType !== "PROFORMA") return res.status(400).json(apiError("Not a Proforma invoice"));
  if (proforma.status !== "APPROVED") return res.status(400).json(apiError("Only approved proformas can be converted", "status"));

  // Create a new Sales Invoice with its own invoice number.
  await prisma.$transaction(async (tx) => {
    if (!proforma.glRevenueAccountKey) throw new Error("glRevenueAccountKey missing on proforma");
    const invoiceNumber = await allocateNextInvoiceNumber("SALES", proforma.invoiceDate);
    const created = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceType: "SALES",
        status: "SENT",
        invoiceDate: proforma.invoiceDate,
        dueDate: proforma.dueDate,
        partyId: proforma.partyId,
        currency: proforma.currency,
        subtotal: proforma.subtotal,
        taxAmount: proforma.taxAmount,
        totalAmount: proforma.totalAmount,
        amountPaid: 0,
        balanceDue: proforma.totalAmount,
        paymentTerms: proforma.paymentTerms,
        notes: proforma.notes,
        linkedProjectId: proforma.linkedProjectId,
        linkedDirectorId: proforma.linkedDirectorId,
        documentUrl: proforma.documentUrl,
        glStatus: "NOT_POSTED",
        glRevenueAccountKey: proforma.glRevenueAccountKey,
        glExpenseAccountKey: null,
        reversalOfId: null,
        creditNoteForId: null,
        createdBy: req.user!.id
      },
      select: { id: true }
    });

    await tx.invoiceLineItem.createMany({
      data: proforma.lineItems.map((li) => ({
        invoiceId: created.id,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate,
        taxAmount: li.taxAmount,
        subtotal: li.subtotal,
        total: li.total
      }))
    });

    // Post GL for the new Sales invoice.
    const ref = await allocateNextReferenceNumber();
    const docStatus = proforma.documentUrl ? DocumentStatus.ATTACHED : DocumentStatus.MISSING;
    await tx.transaction.create({
      data: {
        type: "PROJECT_REVENUE",
        date: proforma.invoiceDate,
        amount: proforma.totalAmount,
        currency: proforma.currency,
        description: `SALES ${invoiceNumber} — Total ${proforma.totalAmount} ${proforma.currency}`,
        directorId: proforma.linkedDirectorId ?? null,
        projectId: proforma.linkedProjectId ?? null,
        referenceNumber: ref,
        externalReference: invoiceNumber,
        documentUrl: proforma.documentUrl ?? null,
        documentStatus: docStatus,
        postingStatus: TransactionPostingStatus.POSTED,
        manualDebitAccountKey: "accounts_receivable",
        manualCreditAccountKey: proforma.glRevenueAccountKey!,
        invoiceId: created.id,
        invoicePaymentId: null,
        createdBy: req.user!.id
      }
    });

    await tx.invoice.update({ where: { id: created.id }, data: { glStatus: "POSTED" } });
  });

  await writeAudit(req, { action: "CONVERT_PROFORMA", entityType: "Invoice", entityId: id, before: null, after: { status: "CONVERTED" } });
  return res.json({ ok: true });
});

// Create credit note draft against a PAID/PARTIALLY_PAID sales invoice
router.post("/:id/credit-notes", requireRole("ADMIN"), validateBody(createInvoiceSchema), async (req, res) => {
  const originalId = Number(req.params.id);
  if (!Number.isFinite(originalId)) return res.status(400).json(apiError("Invalid original id"));

  const original = await prisma.invoice.findUnique({
    where: { id: originalId, isDeleted: false },
    select: { id: true, invoiceType: true, status: true, totalAmount: true, partyId: true, currency: true, invoiceDate: true, dueDate: true, paymentTerms: true, notes: true, linkedProjectId: true, linkedDirectorId: true, documentUrl: true, glRevenueAccountKey: true }
  });
  if (!original) return res.status(404).json(apiError("Original invoice not found"));
  if (original.invoiceType !== "SALES") return res.status(400).json(apiError("Credit notes can only be created against SALES invoices"));
  if (!["PAID", "PARTIALLY_PAID"].includes(original.status)) return res.status(400).json(apiError("Credit note can only be created against PAID/PARTIALLY_PAID sales invoices"));

  const body = req.body as any;
  if (body.invoiceType !== "CREDIT_NOTE") return res.status(400).json(apiError("invoiceType must be CREDIT_NOTE", "invoiceType"));
  const invoiceDate = new Date(body.invoiceDate);
  const dueDate = new Date(body.dueDate);
  if (dueDate.getTime() < invoiceDate.getTime()) return res.status(400).json(apiError("Due date cannot be before invoice date", "dueDate"));

  // Totals computed server-side
  const totals = computeInvoiceTotals(
    body.lineItems.map((li: any) => ({ quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate })),
    body.currency
  );
  if (totals.totalAmount > Number(original.totalAmount) + 1e-9) {
    return res.status(400).json(apiError("Credit note total cannot exceed original invoice total", "lineItems"));
  }
  if (body.currency !== original.currency) return res.status(400).json(apiError("Credit note currency must match original invoice currency", "currency"));

  const invoiceNumber = await allocateNextInvoiceNumber("CREDIT_NOTE", invoiceDate);

  const lineItemsComputed = body.lineItems.map((li: any) => {
    const c = computeInvoiceLineItemTotals({ quantity: li.quantity, unitPrice: li.unitPrice, taxRate: li.taxRate }, body.currency);
    return { ...li, ...c };
  });

  const created = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        invoiceType: "CREDIT_NOTE",
        status: "DRAFT",
        invoiceDate,
        dueDate,
        partyId: original.partyId,
        currency: original.currency,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        amountPaid: 0,
        balanceDue: totals.totalAmount,
        paymentTerms: body.paymentTerms ?? original.paymentTerms,
        notes: body.notes ?? original.notes ?? null,
        linkedProjectId: body.linkedProjectId ?? original.linkedProjectId,
        linkedDirectorId: body.linkedDirectorId ?? original.linkedDirectorId,
        documentUrl: body.documentUrl ?? original.documentUrl ?? null,
        glStatus: "NOT_POSTED",
        glRevenueAccountKey: original.glRevenueAccountKey,
        glExpenseAccountKey: null,
        reversalOfId: null,
        creditNoteForId: original.id,
        createdBy: req.user!.id
      },
      select: { id: true }
    });
    await tx.invoiceLineItem.createMany({
      data: lineItemsComputed.map((li: any) => ({
        invoiceId: inv.id,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate,
        taxAmount: li.taxAmount,
        subtotal: li.subtotal,
        total: li.total
      }))
    });
    return inv;
  });

  return res.status(201).json(created);
});

export default router;

