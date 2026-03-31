import type {
  DirectorReceipt,
  DirectorTransactionBatch,
  DirectorTransactionLine,
  Transaction
} from "@prisma/client";
import PDFDocument from "pdfkit";
import { monthYearLabelUtc } from "./directorPosting.js";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(amount: number, currency: string): string {
  const x = Number(amount ?? 0);
  if (currency === "UGX") return `${Math.round(x).toLocaleString("en-GB")} ${currency}`;
  return `${x.toFixed(2)} ${currency}`;
}

function truncate(s: string, max: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function watermark(doc: any, label: string) {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.opacity(0.08);
  doc.fillColor("#0f172a").fontSize(60).font("Helvetica-Bold");
  doc.translate(cx, cy);
  doc.rotate(-30);
  const w = doc.widthOfString(label);
  doc.text(label, -w / 2, -20);
  doc.restore();
}

export type ReceiptModel = {
  receipt: DirectorReceipt;
  /** When provided, narrative meta is merged with batch data and ledger rows are printed. */
  transactionBatch?: DirectorTransactionBatch & {
    transactions?: Transaction[];
    lines?: DirectorTransactionLine[];
  };
  companyName: string;
  director: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  postedBy: string;
};

function decToNumber(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "object" && d !== null && typeof (d as { toNumber?: () => number }).toNumber === "function") {
    return (d as { toNumber: () => number }).toNumber();
  }
  return Number(d);
}

/** When receipt.meta is sparse, map batch typeKey → meta.kind used by confirmation text. */
const TYPE_KEY_TO_KIND: Record<string, string> = {
  CCR: "CONTRIBUTION",
  FNE: "DIRECTORS_DISCIPLINARY_LEVY",
  WDR: "DIRECTORS_CAPITAL_DISTRIBUTION",
  CLN: "COMPANY_LOAN_TO_DIRECTOR",
  CLR: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN",
  FEE: "DIRECTOR_FEE_ALLOWANCE",
  DLN: "DIRECTOR_LOAN_TO_COMPANY",
  DLR: "DIRECTOR_LOAN_REPAYMENT"
};

const TYPE_KEY_TO_RECEIPT_TITLE: Record<string, string> = {
  CCR: "Monthly Capital Contribution",
  FNE: "Directors’ Disciplinary Levy",
  WDR: "Directors’ Capital Distribution",
  CLN: "Company Loan to Director",
  CLR: "Director Repayment of Company Loan",
  FEE: "Director Fee / Allowance",
  DLN: "Director Loan to Company",
  DLR: "Director Repayment to Company"
};

/**
 * Merge JSON meta on the receipt with batch-level JSON and numeric fallbacks so the PDF always
 * reflects posted amounts even if receipt.meta was incomplete.
 */
export function mergeReceiptMeta(
  receipt: DirectorReceipt,
  batch?: DirectorTransactionBatch & { transactions?: Transaction[]; lines?: DirectorTransactionLine[] }
): Record<string, unknown> {
  const fromReceipt = (receipt.meta && typeof receipt.meta === "object" ? receipt.meta : {}) as Record<string, unknown>;
  const fromBatchJson = (batch?.meta && typeof batch.meta === "object" ? batch.meta : {}) as Record<string, unknown>;
  const batchCurrency = batch?.currency || "EUR";
  const batchTotal = batch ? decToNumber(batch.totalAmount) : 0;
  const explicitKind = String(fromReceipt.kind || fromReceipt.txType || "").trim();
  const kind = explicitKind || TYPE_KEY_TO_KIND[batch?.typeKey || ""] || "";

  return {
    ...fromBatchJson,
    ...fromReceipt,
    receiptType:
      fromReceipt.receiptType ||
      fromReceipt.type ||
      TYPE_KEY_TO_RECEIPT_TITLE[batch?.typeKey || ""] ||
      "Director Transaction Receipt",
    kind: kind || fromReceipt.kind,
    currency: fromReceipt.currency || fromBatchJson.currency || batchCurrency,
    amount:
      fromReceipt.amount ??
      fromReceipt.totalAmount ??
      fromReceipt.totalReceived ??
      fromBatchJson.amount ??
      batchTotal,
    glReference: fromReceipt.glReference || receipt.receiptReference
  };
}

function appendPostingRecord(doc: any, model: ReceiptModel, currency: string) {
  const batch = model.transactionBatch;
  if (!batch) return;

  doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Posting record (from ledger)");
  doc.fontSize(8.5).font("Helvetica").fillColor("#64748b").text(
    "Figures below are taken from the posted director transaction batch and related transactions in the system.",
    { lineGap: 2 }
  );
  doc.moveDown(0.35);
  doc.fontSize(9.5).font("Helvetica").fillColor("#334155");
  doc.text(`Batch type: ${batch.typeKey}    Accounting period: ${model.receipt.periodMonth}`);
  doc.text(`Batch total: ${fmtMoney(decToNumber(batch.totalAmount), batch.currency || currency)}`);
  doc.moveDown(0.45);

  const txns = batch.transactions || [];
  if (txns.length > 0) {
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#0f172a").text("Transactions");
    doc.fontSize(8.5).font("Helvetica").fillColor("#334155");
    for (const t of txns) {
      const desc = truncate(String(t.description || ""), 88);
      doc.text(
        `• ${t.referenceNumber}  ${t.type}  ${fmtMoney(t.amount, t.currency || batch.currency || currency)}  ${desc}`,
        { lineGap: 1 }
      );
    }
    doc.moveDown(0.45);
  }

  const lines = batch.lines || [];
  if (lines.length > 0) {
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#0f172a").text("GL lines");
    doc.fontSize(8.5).font("Helvetica").fillColor("#334155");
    for (const L of lines) {
      doc.text(
        `• ${L.side} ${L.accountKey}  ${fmtMoney(decToNumber(L.amount), batch.currency || currency)}  ${truncate(String(L.memo || ""), 78)}`,
        { lineGap: 1 }
      );
    }
    doc.moveDown(0.45);
  }
  doc.moveDown(0.35);
}

function receiptTypeLabel(meta: any): string {
  return String(meta?.receiptType || meta?.type || "Director Transaction Receipt");
}

function confirmationMessage(meta: any, receipt: DirectorReceipt): string {
  const currency = String(meta?.currency || "EUR");
  const amount = Number(meta?.amount ?? meta?.totalAmount ?? 0);
  const dt = receipt.transactionDate;
  const monthYear = monthYearLabelUtc(dt);
  const kind = String(meta?.kind || meta?.txType || "");

  if (kind === "CONTRIBUTION") {
    const side = Number(meta?.sideFundDeduction ?? 0);
    const cap = Number(meta?.capitalCredited ?? Math.max(0, amount - side));
    return `This receipt confirms that a Monthly Capital Contribution for the month of ${monthYear} amounting to ${fmtMoney(
      amount,
      currency
    )} has been successfully received and posted to your capital account on ${fmtDate(
      dt
    )}. A mandatory Side Fund deduction of ${fmtMoney(side || 10, currency)} has been applied, with the remaining ${fmtMoney(
      cap,
      currency
    )} credited to your director capital account.`;
  }
  if (kind === "CONTRIBUTION_ARREARS") {
    const months = Number(meta?.months ?? 0);
    const range = String(meta?.periodCovered || meta?.monthRange || "—");
    const side = Number(meta?.sideFundDeduction ?? 0);
    const cap = Number(meta?.capitalCredited ?? Math.max(0, amount - side));
    return `This receipt confirms that a Contribution in Arrears of ${fmtMoney(
      amount,
      currency
    )} covering ${months} months (${range}) has been received and posted to your capital account on ${fmtDate(
      dt
    )}. Side Fund deductions of ${fmtMoney(side, currency)} have been applied at ${fmtMoney(
      meta?.perMonthSideFund ?? 10,
      currency
    )} per month, with the remaining ${fmtMoney(cap, currency)} credited to your director capital account.`;
  }
  if (kind === "SUPPLEMENTARY_CAPITAL_CONTRIBUTION") {
    return `This receipt confirms that a Supplementary Capital Contribution of ${fmtMoney(
      amount,
      currency
    )} has been received and posted to your director capital account on ${fmtDate(
      dt
    )}. This contribution is in addition to your standard monthly obligation for ${monthYear} and further increases your equity position in Zweck Co. Ltd accordingly.`;
  }
  if (kind === "CAPITAL_REINSTATEMENT") {
    return `This receipt confirms that a Capital Reinstatement of ${fmtMoney(
      amount,
      currency
    )} has been received and applied on ${fmtDate(dt)} against your Directors’ Capital Distribution of ${fmtMoney(
      Number(meta?.originalAmount ?? 0),
      currency
    )} dated ${String(meta?.originalDistributionDate || "—")}. Total reinstated to date: ${fmtMoney(
      Number(meta?.totalReinstated ?? 0),
      currency
    )}. Outstanding balance remaining: ${fmtMoney(Number(meta?.outstandingBalance ?? 0), currency)}.`;
  }
  if (kind === "DIRECTORS_CAPITAL_DISTRIBUTION") {
    return `This receipt confirms that a Directors’ Capital Distribution of ${fmtMoney(
      amount,
      currency
    )} has been approved and posted on ${fmtDate(
      dt
    )}. This amount has been disbursed from your director capital account.\n\nThe outstanding reinstatement balance of ${fmtMoney(
      Number(meta?.outstandingBalance ?? amount),
      currency
    )} remains on record and is subject to reinstatement in accordance with the Zweck Co. Ltd Internal Governance Framework.`;
  }
  if (kind === "DIRECTORS_DISCIPLINARY_LEVY") {
    const reason = String(meta?.reason || "—");
    return `This receipt confirms that a Directors’ Disciplinary Levy of ${fmtMoney(
      amount,
      currency
    )} has been recorded against your account on ${fmtDate(dt)} for the period of ${monthYear}. Reason: ${reason}. This charge has been posted in accordance with the Zweck Co. Ltd Internal Governance Framework.`;
  }
  if (kind === "COMPANY_LOAN_TO_DIRECTOR") {
    const terms = String(meta?.repaymentTerms || "—");
    return `This receipt confirms that a Company Loan of ${fmtMoney(
      amount,
      currency
    )} has been approved and disbursed to your account on ${fmtDate(
      dt
    )} in accordance with the Zweck Co. Ltd Side Fund lending policy. Repayment terms: ${terms}. This loan is recoverable from the Side Fund and is subject to interest as agreed.`;
  }
  if (kind === "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN") {
    return `This receipt confirms that a repayment of ${fmtMoney(
      Number(meta?.totalReceived ?? amount),
      currency
    )} has been received on ${fmtDate(dt)} against your Company Loan of ${fmtMoney(
      Number(meta?.originalPrincipal ?? 0),
      currency
    )}. Principal settled: ${fmtMoney(Number(meta?.principalAmount ?? 0), currency)}. Interest paid: ${fmtMoney(
      Number(meta?.interestAmount ?? 0),
      currency
    )}. Outstanding loan balance: ${fmtMoney(Number(meta?.outstandingBalance ?? 0), currency)}.`;
  }
  if (kind === "DIRECTOR_FEE_ALLOWANCE") {
    return `This receipt confirms that a Director Fee and Allowance of ${fmtMoney(
      amount,
      currency
    )} for ${monthYear} has been approved and posted on ${fmtDate(
      dt
    )}. This payment has been processed in accordance with the approved director fee schedule and is reflected in the company accounts.`;
  }
  if (kind === "DIRECTOR_LOAN_TO_COMPANY") {
    return `This receipt confirms that a Director Loan to Company of ${fmtMoney(
      amount,
      currency
    )} has been received and posted on ${fmtDate(
      dt
    )}. This loan has been recorded as a liability of Zweck Co. Ltd and will be repayable in accordance with the agreed terms.`;
  }
  if (kind === "DIRECTOR_LOAN_REPAYMENT") {
    return `This receipt confirms that a Director Loan Repayment of ${fmtMoney(
      amount,
      currency
    )} has been received and posted on ${fmtDate(
      dt
    )}. This repayment reduces the outstanding director loan balance recorded in the Zweck Co. Ltd accounts.`;
  }
  return `This is an official system receipt confirming that the transaction was posted on ${fmtDate(dt)}.`;
}

function closingText(meta: any): string {
  const kind = String(meta?.kind || meta?.txType || "");
  if (kind === "CONTRIBUTION") {
    return "On behalf of the Board of Directors of Zweck Co. Ltd, we sincerely thank you for your continued commitment and financial dedication to our shared vision. Your monthly contribution is a vital pillar of the company’s growth and stability. It is greatly appreciated.";
  }
  if (kind === "CONTRIBUTION_ARREARS") {
    return "We appreciate you settling your outstanding contributions and for reaffirming your commitment to Zweck Co. Ltd. Your prompt resolution of arrears strengthens the financial integrity of the company and is duly acknowledged by the Board. Thank you.";
  }
  if (kind === "SUPPLEMENTARY_CAPITAL_CONTRIBUTION") {
    return "Your Supplementary Capital Contribution reflects an exceptional level of commitment to the growth of Zweck Co. Ltd. On behalf of the Board, we extend our sincere gratitude for this additional investment in our collective future. Your confidence in the company is deeply valued.";
  }
  if (kind === "CAPITAL_REINSTATEMENT") {
    return "Thank you for your reinstatement payment. Your ongoing effort to restore your capital position demonstrates your dedication to the financial health of Zweck Co. Ltd. The Board acknowledges and appreciates your commitment to this obligation.";
  }
  if (kind === "DIRECTORS_CAPITAL_DISTRIBUTION") {
    return "Please note that the outstanding reinstatement balance remains on record and is expected to be settled in accordance with the Zweck Co. Ltd Internal Governance Framework. Should you have any questions regarding the reinstatement schedule, please contact the Company Secretary.";
  }
  if (kind === "DIRECTORS_DISCIPLINARY_LEVY") {
    return "This levy has been applied in accordance with our governance framework. We encourage full compliance with board obligations going forward to avoid further charges. Should you wish to contest this levy or seek clarification, please reach out to the Company treasurer within 14 days of this receipt.";
  }
  if (kind === "COMPANY_LOAN_TO_DIRECTOR") {
    return "This loan has been approved by the Board in accordance with the Side Fund lending policy of Zweck Co. Ltd. Please ensure repayment is made within the agreed schedule. Timely repayment supports the sustainability of the Side Fund for the benefit of all directors. Should you require any clarification regarding your repayment obligations, please contact the Company Treasurer.";
  }
  if (kind === "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN") {
    return "Thank you for settling your Company Loan in a timely manner. Your adherence to the agreed repayment schedule reflects your commitment to the governance standards of Zweck Co. Ltd and ensures the continued availability of the Side Fund for all directors. This is sincerely appreciated.";
  }
  if (kind === "DIRECTOR_FEE_ALLOWANCE") {
    return "Thank you for your continued service and leadership at Zweck Tukula Co. Ltd. This fee reflects the Board’s recognition of the time and effort you invest in the company’s direction and governance. Your dedication is greatly valued.";
  }
  if (kind === "DIRECTOR_LOAN_TO_COMPANY") {
    return "The Board sincerely thanks you for extending this loan to Zweck Co. Ltd. Your willingness to support the company’s liquidity needs from your personal resources demonstrates extraordinary confidence in our shared mission. This contribution is formally acknowledged and will be honoured in full accordance with agreed terms.";
  }
  if (kind === "DIRECTOR_LOAN_REPAYMENT") {
    return "Thank you for your continued patience and trust in the company. This repayment has been duly recorded and your outstanding balance updated accordingly. Zweck Co. Ltd remains committed to honouring all director loan obligations in a timely and transparent manner.";
  }
  return "This is a system-generated receipt confirming the above transaction has been recorded in the Zweck Co. Ltd accounting system. Please retain for your records.";
}

export function buildDirectorReceiptPdfBuffer(model: ReceiptModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "A4",
      info: { Title: model.receipt.receiptReference, Author: model.companyName }
    });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    watermark(doc, "POSTED");
    doc.on("pageAdded", () => watermark(doc, "POSTED"));

    const meta = mergeReceiptMeta(model.receipt, model.transactionBatch) as any;
    const currency = String(meta.currency || model.transactionBatch?.currency || "EUR");

    doc.fontSize(18).font("Helvetica-Bold").fillColor("#0f172a").text(model.companyName, { align: "center" });
    doc.moveDown(0.25);
    doc.fontSize(10).font("Helvetica").fillColor("#334155").text("Official Director Transaction Receipt", {
      align: "center"
    });
    doc.moveDown(1);

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0f172a").text(receiptTypeLabel(meta));
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#334155");
    doc.text(`Receipt Reference: ${model.receipt.receiptReference}`);
    doc.text(`Transaction Date: ${fmtDate(model.receipt.transactionDate)}`);
    doc.moveDown(0.8);

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Director");
    doc.fontSize(9.5).font("Helvetica").fillColor("#334155");
    doc.text(`Name: ${model.director.name}`);
    doc.text(`Email: ${model.director.email || "—"}`);
    doc.text(`Phone: ${model.director.phone || "—"}`);
    doc.text(`Address: ${truncate(model.director.address || "—", 120)}`);
    doc.text(`Director ID: ${model.director.id}`);
    doc.text(`Equity account: 3110–3150`);
    doc.text(`Side fund account: 3200`);
    doc.moveDown(0.8);

    appendPostingRecord(doc, model, currency);

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Confirmation");
    doc.fontSize(9.5).font("Helvetica").fillColor("#334155").text(confirmationMessage(meta, model.receipt), {
      lineGap: 2
    });
    doc.moveDown(0.8);

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("GL reference");
    doc.fontSize(9.5).font("Helvetica").fillColor("#334155");
    doc.rect(doc.x, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 28).fill("#f1f5f9");
    doc.fillColor("#334155").text(
      `GL Reference: ${meta.glReference || "—"}    Receipt Reference: ${model.receipt.receiptReference}    Currency: ${currency}    Period: ${monthYearLabelUtc(
        model.receipt.transactionDate
      )}`,
      doc.page.margins.left + 8,
      doc.y - 20,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 16 }
    );
    doc.moveDown(2.2);

    doc.fontSize(10).font("Helvetica-Oblique").fillColor("#334155").text(closingText(meta), { lineGap: 2 });
    doc.moveDown(0.8);
    doc.fontSize(9).font("Helvetica-Oblique").fillColor("#64748b").text(
      "This is a system-generated receipt confirming the above transaction has been recorded in the Zweck Co. Ltd accounting system. Please retain for your records. For queries contact the treasurer.",
      { lineGap: 2 }
    );
    doc.moveDown(1.2);

    doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#0f172a").text("Posted by");
    doc.fontSize(9.5).font("Helvetica").fillColor("#334155").text(model.postedBy || "—");

    doc.end();
  });
}

