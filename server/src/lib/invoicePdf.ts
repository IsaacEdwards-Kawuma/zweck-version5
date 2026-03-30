import type { Client, Invoice, InvoiceLineItem, InvoicePayment } from "@prisma/client";
import PDFDocument from "pdfkit";

export type InvoicePdfModel = Invoice & {
  party: Client | null;
  lineItems: InvoiceLineItem[];
  payments: InvoicePayment[];
  linkedProject?: { code: string; name: string } | null;
  linkedDirector?: { name: string } | null;
};

function num(n: unknown): number {
  return Number(n ?? 0);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(amount: number, currency: string): string {
  const x = num(amount);
  if (currency === "UGX") return `${Math.round(x).toLocaleString("en-GB")} ${currency}`;
  return `${x.toFixed(2)} ${currency}`;
}

function truncate(s: string, max: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function watermarkColor(status: string): string {
  switch (status) {
    case "PAID":
      return "#16a34a";
    case "OVERDUE":
      return "#dc2626";
    case "DRAFT":
      return "#64748b";
    default:
      return "#94a3b8";
  }
}

/**
 * Builds a PDF buffer for an invoice (company header, party, lines, totals, terms, payments, status watermark).
 */
export function buildInvoicePdfBuffer(invoice: InvoicePdfModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      margin: 48,
      size: "A4",
      info: { Title: invoice.invoiceNumber, Author: "Zweck Co. Ltd" }
    });

    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const status = String(invoice.status);
    const drawWatermark = () => {
      const cx = doc.page.width / 2;
      const cy = doc.page.height / 2;
      doc.save();
      doc.opacity(0.1);
      doc.fillColor(watermarkColor(status)).fontSize(52).font("Helvetica-Bold");
      doc.translate(cx, cy);
      doc.rotate(-35);
      const label = status.toUpperCase();
      const w = doc.widthOfString(label);
      doc.text(label, -w / 2, -18);
      doc.restore();
    };

    drawWatermark();
    doc.on("pageAdded", drawWatermark);

    doc.fontSize(20).font("Helvetica-Bold").fillColor("#0f172a").text("Zweck Co. Ltd", { align: "center" });
    doc.moveDown(0.25);
    doc.fontSize(10).font("Helvetica").fillColor("#475569").text("Invoice", { align: "center" });
    doc.moveDown(1.2);

    const left = doc.page.margins.left;
    const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colGap = 24;
    const colW = (contentW - colGap) / 2;
    const yBlock = doc.y;

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Bill to", left, yBlock, { width: colW });
    doc.font("Helvetica").fontSize(9.5).fillColor("#334155");
    const party = invoice.party;
    let partyY = yBlock + 16;
    if (party) {
      doc.text(party.name, left, partyY, { width: colW });
      partyY = doc.y + 2;
      if (party.type) doc.text(String(party.type), left, partyY, { width: colW });
      partyY = doc.y + 2;
      if (party.email) doc.text(party.email, left, partyY, { width: colW });
      partyY = doc.y + 2;
      if (party.phone) doc.text(party.phone, left, partyY, { width: colW });
      partyY = doc.y + 2;
      if (party.address) doc.text(party.address, left, partyY, { width: colW });
    } else {
      doc.text("—", left, partyY, { width: colW });
    }

    const rightX = left + colW + colGap;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Invoice details", rightX, yBlock, { width: colW });
    doc.font("Helvetica").fontSize(9.5).fillColor("#334155");
    doc.text(`Number: ${invoice.invoiceNumber}`, rightX, yBlock + 16, { width: colW });
    doc.text(`Type: ${invoice.invoiceType}`, rightX);
    doc.text(`Date: ${fmtDate(invoice.invoiceDate)}`, rightX);
    doc.text(`Due: ${fmtDate(invoice.dueDate)}`, rightX);
    doc.text(`Currency: ${invoice.currency}`, rightX);
    doc.text(`Status: ${invoice.status}`, rightX);
    doc.text(`GL: ${invoice.glStatus}`, rightX);

    doc.y = Math.max(doc.y, partyY + 36);
    doc.moveDown(0.5);

    if (invoice.linkedProject) {
      doc.font("Helvetica-Bold").fontSize(10).text("Linked project", left);
      doc.font("Helvetica").fontSize(9.5).text(`${invoice.linkedProject.code} · ${invoice.linkedProject.name}`, left, undefined, { width: contentW });
      doc.moveDown(0.35);
    }
    if (invoice.linkedDirector) {
      doc.font("Helvetica-Bold").fontSize(10).text("Linked director", left);
      doc.font("Helvetica").fontSize(9.5).text(invoice.linkedDirector.name, left, undefined, { width: contentW });
      doc.moveDown(0.35);
    }

    doc.font("Helvetica-Bold").fontSize(10).text("Payment terms", left);
    doc.font("Helvetica").fontSize(9.5).text(invoice.paymentTerms || "—", left, undefined, { width: contentW });
    doc.moveDown(0.75);

    doc.font("Helvetica-Bold").fontSize(11).text("Line items", left);
    doc.moveDown(0.35);

    const cur = invoice.currency;
    const tableTop = doc.y;
    const descW = contentW * 0.34;
    const qW = contentW * 0.07;
    const upW = contentW * 0.13;
    const trW = contentW * 0.08;
    const stW = contentW * 0.12;
    const taxW = contentW * 0.12;
    const totW = contentW - descW - qW - upW - trW - stW - taxW;

    doc.font("Helvetica-Bold").fontSize(8);
    let x = left;
    doc.text("Description", x, tableTop, { width: descW });
    x += descW;
    doc.text("Qty", x, tableTop, { width: qW, align: "right" });
    x += qW;
    doc.text("Unit", x, tableTop, { width: upW, align: "right" });
    x += upW;
    doc.text("Tax %", x, tableTop, { width: trW, align: "right" });
    x += trW;
    doc.text("Subtotal", x, tableTop, { width: stW, align: "right" });
    x += stW;
    doc.text("Tax", x, tableTop, { width: taxW, align: "right" });
    x += taxW;
    doc.text("Total", x, tableTop, { width: totW, align: "right" });

    doc.moveTo(left, tableTop + 14).lineTo(left + contentW, tableTop + 14).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
    doc.y = tableTop + 20;

    doc.font("Helvetica").fontSize(8).fillColor("#1e293b");
    for (const li of invoice.lineItems || []) {
      const rowY = doc.y;
      if (rowY > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
      }
      const y0 = doc.y;
      x = left;
      doc.text(truncate(li.description, 120), x, y0, { width: descW });
      x += descW;
      doc.text(String(li.quantity), x, y0, { width: qW, align: "right" });
      x += qW;
      doc.text(fmtMoney(num(li.unitPrice), cur), x, y0, { width: upW, align: "right" });
      x += upW;
      doc.text(`${num(li.taxRate)}%`, x, y0, { width: trW, align: "right" });
      x += trW;
      doc.text(fmtMoney(num(li.subtotal), cur), x, y0, { width: stW, align: "right" });
      x += stW;
      doc.text(fmtMoney(num(li.taxAmount), cur), x, y0, { width: taxW, align: "right" });
      x += taxW;
      doc.text(fmtMoney(num(li.total), cur), x, y0, { width: totW, align: "right" });
      doc.y = Math.max(doc.y, y0 + 16);
      doc.moveDown(0.15);
    }

    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9.5);
    const sumX = left + contentW * 0.55;
    const sumW = contentW * 0.45;
    doc.text(`Subtotal: ${fmtMoney(num(invoice.subtotal), cur)}`, sumX, doc.y, { width: sumW, align: "right" });
    doc.text(`Tax: ${fmtMoney(num(invoice.taxAmount), cur)}`, sumX, undefined, { width: sumW, align: "right" });
    doc.font("Helvetica-Bold").text(`Total: ${fmtMoney(num(invoice.totalAmount), cur)}`, sumX, undefined, { width: sumW, align: "right" });
    doc.font("Helvetica").font("Helvetica");
    doc.text(`Paid: ${fmtMoney(num(invoice.amountPaid), cur)}`, sumX, undefined, { width: sumW, align: "right" });
    doc.text(`Balance due: ${fmtMoney(num(invoice.balanceDue), cur)}`, sumX, undefined, { width: sumW, align: "right" });

    doc.moveDown(0.75);
    if (invoice.notes) {
      doc.font("Helvetica-Bold").fontSize(10).text("Notes", left);
      doc.font("Helvetica").fontSize(9.5).fillColor("#334155").text(invoice.notes, left, undefined, { width: contentW });
      doc.moveDown(0.5);
    }

    const pays = invoice.payments || [];
    if (pays.length > 0) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Payment history", left);
      doc.moveDown(0.35);
      const phTop = doc.y;
      const pDateW = contentW * 0.18;
      const pMethW = contentW * 0.22;
      const pRefW = contentW * 0.35;
      const pAmtW = contentW - pDateW - pMethW - pRefW;

      doc.font("Helvetica-Bold").fontSize(8);
      let px = left;
      doc.text("Date", px, phTop, { width: pDateW });
      px += pDateW;
      doc.text("Method", px, phTop, { width: pMethW });
      px += pMethW;
      doc.text("Reference", px, phTop, { width: pRefW });
      px += pRefW;
      doc.text("Amount", px, phTop, { width: pAmtW, align: "right" });
      doc.moveTo(left, phTop + 12).lineTo(left + contentW, phTop + 12).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
      doc.y = phTop + 18;

      doc.font("Helvetica").fontSize(8);
      for (const p of pays) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
        const py = doc.y;
        px = left;
        doc.text(fmtDate(p.paymentDate), px, py, { width: pDateW });
        px += pDateW;
        doc.text(truncate(p.paymentMethod, 40), px, py, { width: pMethW });
        px += pMethW;
        doc.text(p.reference ? truncate(p.reference, 48) : "—", px, py, { width: pRefW });
        px += pRefW;
        doc.text(fmtMoney(num(p.amount), String(p.currency || cur)), px, py, { width: pAmtW, align: "right" });
        doc.y = py + 14;
        doc.moveDown(0.1);
      }
    }

    doc.end();
  });
}
