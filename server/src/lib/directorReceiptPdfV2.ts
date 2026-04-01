import type { DirectorReceipt, Director } from "@prisma/client";
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

function decToNumber(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d === "object" && d !== null && typeof (d as { toNumber?: () => number }).toNumber === "function") {
    return (d as { toNumber: () => number }).toNumber();
  }
  return Number(d);
}

function truncate(s: string, max: number): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function watermarkPosted(doc: any) {
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.opacity(0.07);
  doc.fillColor("#B78E2D").fontSize(88).font("Helvetica-Bold");
  doc.translate(cx, cy);
  doc.rotate(-28);
  const w = doc.widthOfString("POSTED");
  doc.text("POSTED", -w / 2, -44);
  doc.restore();
  doc.opacity(1);
}

type ReceiptV2Model = {
  companyName: string;
  receipt: DirectorReceipt & {
    director: {
      id: number;
      name: string;
      email: string | null;
      phone: string | null;
      address: string | null;
    };
  };
  postedBy: string;
  /** Username / email from session for footer */
  sessionUsername: string;
};

type Kind =
  | "CONTRIBUTION"
  | "CONTRIBUTION_ARREARS"
  | "SUPPLEMENTARY_CAPITAL_CONTRIBUTION"
  | "DIRECTORS_CAPITAL_DISTRIBUTION"
  | "CAPITAL_REINSTATEMENT"
  | "DIRECTORS_DISCIPLINARY_LEVY"
  | "DIRECTOR_FEE_ALLOWANCE"
  | "DIRECTOR_LOAN_TO_COMPANY"
  | "DIRECTOR_LOAN_REPAYMENT"
  | "COMPANY_LOAN_TO_DIRECTOR"
  | "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN";

function kindFromReceipt(receipt: DirectorReceipt): Kind {
  return receipt.transactionType as Kind;
}

function typeBadgeLabel(kind: Kind): string {
  const map: Record<Kind, string> = {
    CONTRIBUTION: "Monthly Contribution",
    CONTRIBUTION_ARREARS: "Arrears",
    SUPPLEMENTARY_CAPITAL_CONTRIBUTION: "Supplementary",
    DIRECTORS_CAPITAL_DISTRIBUTION: "Capital Distribution",
    CAPITAL_REINSTATEMENT: "Reinstatement",
    DIRECTORS_DISCIPLINARY_LEVY: "Disciplinary Levy",
    DIRECTOR_FEE_ALLOWANCE: "Fee / Allowance",
    DIRECTOR_LOAN_TO_COMPANY: "Loan to Company",
    DIRECTOR_LOAN_REPAYMENT: "Loan Repayment",
    COMPANY_LOAN_TO_DIRECTOR: "Company Loan",
    DIRECTOR_REPAYMENT_OF_COMPANY_LOAN: "Company Loan Repayment"
  };
  return map[kind] || "Director Receipt";
}

function confirmationMessage(kind: Kind, receipt: DirectorReceipt, additional: any): string {
  const currency = receipt.currency || "EUR";
  const dt = receipt.transactionDate;
  const monthYear = monthYearLabelUtc(dt);

  if (kind === "CONTRIBUTION") {
    const total = decToNumber(receipt.totalAmount);
    const side = 10;
    const cap = decToNumber(receipt.capitalAmount ?? Math.max(0, total - side));
    return `This receipt confirms that a Monthly Capital Contribution for the month of ${monthYear} amounting to ${fmtMoney(
      total,
      currency
    )} has been successfully received and posted to your capital account on ${fmtDate(
      dt
    )}. A mandatory Side Fund deduction of ${fmtMoney(10, currency)} has been applied, with the remaining ${fmtMoney(
      cap,
      currency
    )} credited to your director capital account.`;
  }

  if (kind === "CONTRIBUTION_ARREARS") {
    const total = decToNumber(receipt.totalAmount);
    const months = Number(additional?.months ?? 0);
    const range = String(additional?.monthRange || additional?.periodCovered || "—");
    const side = decToNumber(receipt.sideFundAmount ?? months * 10);
    const cap = decToNumber(receipt.capitalAmount ?? Math.max(0, total - side));
    return `This receipt confirms that a Contribution in Arrears of ${fmtMoney(
      total,
      currency
    )} covering ${months} months (${range}) has been received and posted to your capital account on ${fmtDate(
      dt
    )}. Side Fund deductions of ${fmtMoney(side, currency)} have been applied at ${fmtMoney(
      10,
      currency
    )} per month, with the remaining ${fmtMoney(cap, currency)} credited to your director capital account.`;
  }

  if (kind === "SUPPLEMENTARY_CAPITAL_CONTRIBUTION") {
    const total = decToNumber(receipt.totalAmount);
    return `This receipt confirms that a Supplementary Capital Contribution of ${fmtMoney(
      total,
      currency
    )} has been received and posted to your director capital account on ${fmtDate(
      dt
    )}. This contribution is in addition to your standard monthly obligation for ${monthYear} and further increases your equity position in Zweck Co. Ltd accordingly.`;
  }

  if (kind === "CAPITAL_REINSTATEMENT") {
    const total = decToNumber(receipt.totalAmount);
    return `This receipt confirms that a Capital Reinstatement of ${fmtMoney(
      total,
      currency
    )} has been received and applied on ${fmtDate(dt)} against your Directors’ Capital Distribution of ${fmtMoney(
      Number(additional?.originalAmount ?? 0),
      currency
    )} dated ${String(additional?.originalDistributionDate || "—")}. Total reinstated to date: ${fmtMoney(
      Number(additional?.totalReinstated ?? 0),
      currency
    )}. Outstanding balance remaining: ${fmtMoney(Number(additional?.outstandingBalance ?? 0), currency)}.`;
  }

  if (kind === "DIRECTORS_CAPITAL_DISTRIBUTION") {
    const total = decToNumber(receipt.totalAmount);
    return `This receipt confirms that a Directors’ Capital Distribution of ${fmtMoney(
      total,
      currency
    )} has been approved and posted on ${fmtDate(
      dt
    )}. This amount has been disbursed from your director capital account. The outstanding reinstatement balance of ${fmtMoney(
      Number(additional?.outstandingBalance ?? total),
      currency
    )} remains on record and is subject to reinstatement in accordance with the Zweck Co. Ltd Internal Governance Framework.`;
  }

  if (kind === "DIRECTORS_DISCIPLINARY_LEVY") {
    const total = decToNumber(receipt.totalAmount);
    const reason = String(additional?.reason || "—");
    return `This receipt confirms that a Directors’ Disciplinary Levy of ${fmtMoney(
      total,
      currency
    )} has been recorded against your account on ${fmtDate(dt)} for the period of ${monthYear}. Reason: ${reason}. This charge has been posted in accordance with the Zweck Co. Ltd Internal Governance Framework.`;
  }

  if (kind === "DIRECTOR_FEE_ALLOWANCE") {
    const total = decToNumber(receipt.totalAmount);
    return `This receipt confirms that a Director Fee and Allowance of ${fmtMoney(
      total,
      currency
    )} for ${monthYear} has been approved and posted on ${fmtDate(
      dt
    )}. This payment has been processed in accordance with the approved director fee schedule and is reflected in the company accounts.`;
  }

  if (kind === "DIRECTOR_LOAN_TO_COMPANY") {
    const total = decToNumber(receipt.totalAmount);
    return `This receipt confirms that a Director Loan to Company of ${fmtMoney(
      total,
      currency
    )} has been received and posted on ${fmtDate(
      dt
    )}. This loan has been recorded as a liability of Zweck Co. Ltd and will be repayable in accordance with the agreed terms.`;
  }

  if (kind === "DIRECTOR_LOAN_REPAYMENT") {
    const total = decToNumber(receipt.totalAmount);
    return `This receipt confirms that a Director Loan Repayment of ${fmtMoney(
      total,
      currency
    )} has been received and posted on ${fmtDate(
      dt
    )}. This repayment reduces the outstanding director loan balance recorded in the Zweck Co. Ltd accounts.`;
  }

  if (kind === "COMPANY_LOAN_TO_DIRECTOR") {
    const total = decToNumber(receipt.totalAmount);
    const terms = String(additional?.repaymentTerms || additional?.terms || "—");
    return `This receipt confirms that a Company Loan of ${fmtMoney(
      total,
      currency
    )} has been approved and disbursed to your account on ${fmtDate(
      dt
    )} in accordance with the Zweck Co. Ltd Side Fund lending policy. Repayment terms: ${terms}. This loan is recoverable from the Side Fund and is subject to interest as agreed.`;
  }

  if (kind === "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN") {
    const totalReceived = Number(additional?.totalReceived ?? receipt.totalAmount ?? 0);
    return `This receipt confirms that a repayment of ${fmtMoney(
      totalReceived,
      receipt.currency || "EUR"
    )} has been received on ${fmtDate(dt)} against your Company Loan of ${fmtMoney(
      Number(additional?.originalPrincipal ?? 0),
      receipt.currency || "EUR"
    )}. Principal settled: ${fmtMoney(Number(additional?.principalAmount ?? 0), receipt.currency || "EUR")}. Interest paid: ${fmtMoney(
      Number(additional?.interestAmount ?? 0),
      receipt.currency || "EUR"
    )}. Outstanding loan balance: ${fmtMoney(Number(additional?.outstandingBalance ?? 0), receipt.currency || "EUR")}.`;
  }

  return `This receipt confirms that a director transaction of ${fmtMoney(
    decToNumber(receipt.totalAmount),
    receipt.currency || "EUR"
  )} has been posted on ${fmtDate(receipt.transactionDate)}.`;
}

function closingMessage(kind: Kind): string {
  const map: Record<Kind, string> = {
    CONTRIBUTION:
      "On behalf of the Board of Directors of Zweck Co. Ltd, we sincerely thank you for your continued commitment and financial dedication to our shared vision. Your monthly contribution is a vital pillar of the company’s growth and stability. It is greatly appreciated.",
    CONTRIBUTION_ARREARS:
      "We appreciate you settling your outstanding contributions and for reaffirming your commitment to Zweck Co. Ltd. Your prompt resolution of arrears strengthens the financial integrity of the company and is duly acknowledged by the Board. Thank you.",
    SUPPLEMENTARY_CAPITAL_CONTRIBUTION:
      "Your Supplementary Capital Contribution reflects an exceptional level of commitment to the growth of Zweck Co. Ltd. On behalf of the Board, we extend our sincere gratitude for this additional investment in our collective future. Your confidence in the company is deeply valued.",
    CAPITAL_REINSTATEMENT:
      "Thank you for your reinstatement payment. Your ongoing effort to restore your capital position demonstrates your dedication to the financial health of Zweck Co. Ltd. The Board acknowledges and appreciates your commitment to this obligation.",
    DIRECTORS_CAPITAL_DISTRIBUTION:
      "Please note that the outstanding reinstatement balance remains on record and is expected to be settled in accordance with the Zweck Co. Ltd Internal Governance Framework. Should you have any questions regarding the reinstatement schedule, please contact the Company Secretary.",
    DIRECTORS_DISCIPLINARY_LEVY:
      "This levy has been applied in accordance with our governance framework. We encourage full compliance with board obligations going forward. Should you wish to contest this levy, please reach out to the Company Secretary within 14 days of this receipt.",
    DIRECTOR_FEE_ALLOWANCE:
      "Thank you for your continued service and leadership at Zweck Co. Ltd. This fee reflects the Board’s recognition of the time and effort you invest in the company’s direction and governance. Your dedication is greatly valued.",
    DIRECTOR_LOAN_TO_COMPANY:
      "The Board sincerely thanks you for extending this loan to Zweck Co. Ltd. Your willingness to support the company’s liquidity needs demonstrates extraordinary confidence in our shared mission. This will be honoured in full accordance with agreed terms.",
    DIRECTOR_LOAN_REPAYMENT:
      "Thank you for your continued patience and trust. This repayment has been duly recorded and your outstanding balance updated. Zweck Co. Ltd remains committed to honouring all director loan obligations in a timely and transparent manner.",
    COMPANY_LOAN_TO_DIRECTOR:
      "This loan has been approved in accordance with the Side Fund lending policy. Please ensure repayment is made within the agreed schedule. Timely repayment ensures the continued availability of the Side Fund for all directors.",
    DIRECTOR_REPAYMENT_OF_COMPANY_LOAN:
      "Thank you for settling your Company Loan in a timely manner. Your adherence to the repayment schedule reflects your commitment to the governance standards of Zweck Co. Ltd and ensures the sustainability of the Side Fund for all directors."
  };
  return map[kind] || "";
}

type BreakdownRow = { label: string; value: string; isTotal?: boolean };

function amountBreakdownRows(kind: Kind, receipt: DirectorReceipt, additional: any): BreakdownRow[] {
  const currency = receipt.currency || "EUR";
  const total = decToNumber(receipt.totalAmount);
  const cap = receipt.capitalAmount != null ? decToNumber(receipt.capitalAmount) : null;
  const side = receipt.sideFundAmount != null ? decToNumber(receipt.sideFundAmount) : null;

  if (kind === "CONTRIBUTION") {
    return [
      { label: "Monthly contribution received", value: fmtMoney(total, currency) },
      { label: "Side Fund deduction", value: fmtMoney(10, currency) },
      { label: "Credited to director capital", value: fmtMoney(cap ?? Math.max(0, total - 10), currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "CONTRIBUTION_ARREARS") {
    const months = Number(additional?.months ?? 0);
    const sideFund = side ?? months * 10;
    const capital = cap ?? Math.max(0, total - sideFund);
    return [
      { label: "Arrears contribution received", value: fmtMoney(total, currency) },
      { label: "Months covered", value: String(months || "—") },
      { label: "Side Fund deductions", value: fmtMoney(sideFund, currency) },
      { label: "Credited to director capital", value: fmtMoney(capital, currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "SUPPLEMENTARY_CAPITAL_CONTRIBUTION") {
    return [
      { label: "Supplementary contribution received", value: fmtMoney(total, currency) },
      { label: "Credited to director capital", value: fmtMoney(total, currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "DIRECTORS_CAPITAL_DISTRIBUTION") {
    return [
      { label: "Capital distribution approved", value: fmtMoney(total, currency) },
      { label: "Outstanding reinstatement balance", value: fmtMoney(Number(additional?.outstandingBalance ?? total), currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "CAPITAL_REINSTATEMENT") {
    return [
      { label: "Reinstatement received", value: fmtMoney(total, currency) },
      { label: "Original distribution amount", value: fmtMoney(Number(additional?.originalAmount ?? 0), currency) },
      { label: "Total reinstated to date", value: fmtMoney(Number(additional?.totalReinstated ?? 0), currency) },
      { label: "Outstanding balance remaining", value: fmtMoney(Number(additional?.outstandingBalance ?? 0), currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "DIRECTORS_DISCIPLINARY_LEVY") {
    return [
      { label: "Levy amount", value: fmtMoney(total, currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "DIRECTOR_FEE_ALLOWANCE") {
    return [
      { label: "Fee / allowance approved", value: fmtMoney(total, currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "DIRECTOR_LOAN_TO_COMPANY") {
    return [
      { label: "Loan amount received", value: fmtMoney(total, currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "DIRECTOR_LOAN_REPAYMENT") {
    return [
      { label: "Loan repayment received", value: fmtMoney(total, currency) },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "COMPANY_LOAN_TO_DIRECTOR") {
    return [
      { label: "Loan disbursed", value: fmtMoney(total, currency) },
      { label: "Repayment terms", value: String(additional?.repaymentTerms || additional?.terms || "—") },
      { label: "Total", value: fmtMoney(total, currency), isTotal: true }
    ];
  }

  if (kind === "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN") {
    return [
      { label: "Total amount received", value: fmtMoney(Number(additional?.totalReceived ?? total), currency) },
      { label: "Principal amount", value: fmtMoney(Number(additional?.principalAmount ?? 0), currency) },
      { label: "Interest amount", value: fmtMoney(Number(additional?.interestAmount ?? 0), currency) },
      { label: "Outstanding loan balance", value: fmtMoney(Number(additional?.outstandingBalance ?? 0), currency) },
      { label: "Total", value: fmtMoney(Number(additional?.totalReceived ?? total), currency), isTotal: true }
    ];
  }

  return [{ label: "Total", value: fmtMoney(total, currency), isTotal: true }];
}

function drawGradientBar(doc: any, x: number, y: number, w: number, h: number) {
  const g = doc.linearGradient(x, y, x + w, y);
  g.stop(0, "#0B1B3A");
  g.stop(0.5, "#B78E2D");
  g.stop(1, "#0B1B3A");
  doc.save();
  doc.rect(x, y, w, h).fill(g);
  doc.restore();
}

function roundedRect(doc: any, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, y, w, h, r);
}

function dashedRow(doc: any, x: number, y: number, w: number) {
  doc.save();
  doc.strokeColor("#CBD5E1").lineWidth(1);
  doc.dash(2, { space: 2 });
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.undash();
  doc.restore();
}

function solidRow(doc: any, x: number, y: number, w: number) {
  doc.save();
  doc.strokeColor("#0B1B3A").lineWidth(1.2);
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.restore();
}

export function buildDirectorReceiptPdfV2Buffer(model: ReceiptV2Model): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      info: { Title: model.receipt.referenceNumber, Author: model.companyName }
    });
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Print view: white background, no shadows; watermark on all pages.
    watermarkPosted(doc);
    doc.on("pageAdded", () => watermarkPosted(doc));

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const m = doc.page.margins.left;
    const contentW = pageW - doc.page.margins.left - doc.page.margins.right;

    const receipt = model.receipt;
    const director = model.receipt.director;
    const additional = (receipt.additionalData && typeof receipt.additionalData === "object" ? receipt.additionalData : {}) as any;
    const kind = kindFromReceipt(receipt);

    // Top gradient bar
    drawGradientBar(doc, 0, 0, pageW, 5);
    doc.moveDown(0.6);

    // Header left
    const headerTopY = doc.y;
    doc.fillColor("#0B1B3A");
    doc.font("Times-Bold").fontSize(20).text("Zweck Co. Ltd", m, headerTopY, { width: contentW * 0.62 });
    doc.moveDown(0.1);
    doc.font("Helvetica").fontSize(9).fillColor("#334155").text("OFFICIAL DIRECTOR TRANSACTION RECEIPT", {
      width: contentW * 0.62,
      characterSpacing: 1.1
    });

    // Header right
    const rightX = m + contentW * 0.66;
    const rightW = contentW * 0.34;
    const badgeText = typeBadgeLabel(kind);
    doc.save();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0B1B3A");
    const badgePadX = 10;
    const badgePadY = 5;
    const badgeW = Math.min(rightW, doc.widthOfString(badgeText) + badgePadX * 2);
    const badgeH = 18;
    roundedRect(doc, rightX + (rightW - badgeW), headerTopY, badgeW, badgeH, 9);
    doc.fillAndStroke("#EEF2FF", "#CBD5E1");
    doc.fillColor("#0B1B3A").text(badgeText, rightX + (rightW - badgeW) + badgePadX, headerTopY + 5, {
      width: badgeW - badgePadX * 2,
      align: "center"
    });
    doc.restore();

    const refY = headerTopY + 24;
    doc.font("Courier").fontSize(9.5).fillColor("#0F172A").text(`REF: ${receipt.referenceNumber}`, rightX, refY, {
      width: rightW,
      align: "right"
    });
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`Date: ${fmtDate(receipt.transactionDate)}`, rightX, refY + 14, {
      width: rightW,
      align: "right"
    });

    doc.y = headerTopY + 48;
    doc.moveDown(0.8);

    // Director section (light background)
    const boxX = m;
    const boxW = contentW;
    const boxY = doc.y;
    const boxH = 108;
    doc.save();
    doc.roundedRect(boxX, boxY, boxW, boxH, 10).fill("#F8FAFC");
    doc.restore();

    // Left column content
    const pad = 14;
    const leftX = boxX + pad;
    const leftW = boxW * 0.68 - pad * 1.2;
    const rightChipX = boxX + boxW * 0.72;
    const rightChipW = boxW * 0.28 - pad;

    doc.fillColor("#0B1B3A");
    doc.font("Times-Bold").fontSize(14).text(director.name || `Director ${director.id}`, leftX, boxY + 14, {
      width: leftW
    });

    const iconColor = "#B78E2D";
    const labelColor = "#334155";
    const monoColor = "#0F172A";
    const infoY = boxY + 38;

    doc.font("Helvetica").fontSize(9.5).fillColor(labelColor);
    doc.fillColor(iconColor).text("✉", leftX, infoY, { continued: true });
    doc.fillColor(labelColor).text(`  ${director.email || "—"}`, { width: leftW });
    doc.fillColor(iconColor).text("☎", leftX, infoY + 16, { continued: true });
    doc.fillColor(labelColor).text(`  ${director.phone || "—"}`, { width: leftW });
    doc.fillColor(iconColor).text("⌂", leftX, infoY + 32, { continued: true });
    doc.fillColor(labelColor).text(`  ${truncate(director.address || "—", 92)}`, { width: leftW });

    doc.font("Courier").fontSize(9).fillColor(monoColor).text("Equity account: 3110–3150", leftX, infoY + 52, {
      width: leftW
    });

    // POSTED status chip (right column)
    const chipY = boxY + 18;
    doc.save();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#065F46");
    const chipText = "POSTED";
    const chipPadX = 12;
    const chipPadY = 6;
    const chipW = Math.min(rightChipW, doc.widthOfString(chipText) + chipPadX * 2);
    const chipH = 22;
    roundedRect(doc, rightChipX + (rightChipW - chipW), chipY, chipW, chipH, 11);
    doc.fillAndStroke("#DCFCE7", "#86EFAC");
    doc.fillColor("#065F46").text(chipText, rightChipX + (rightChipW - chipW), chipY + 7, {
      width: chipW,
      align: "center"
    });
    doc.restore();

    doc.y = boxY + boxH + 14;

    // Confirmation message (no codes/DR/CR)
    doc.fillColor("#0F172A").font("Helvetica").fontSize(10.2).text(confirmationMessage(kind, receipt, additional), {
      lineGap: 2
    });
    doc.moveDown(0.8);

    // Amount breakdown
    const rows = amountBreakdownRows(kind, receipt, additional);
    const tableX = m;
    const tableW = contentW;
    const startY = doc.y;
    const rowH = 18;
    const labelW = tableW * 0.68;
    const valueW = tableW * 0.32;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0B1B3A").text("Amount breakdown", tableX, startY);
    doc.y = startY + 16;

    let y = doc.y;
    doc.font("Helvetica").fontSize(9.6).fillColor("#0F172A");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const isTotal = Boolean(r.isTotal);
      const lineY = y + rowH - 4;

      if (isTotal) solidRow(doc, tableX, lineY - 10, tableW);
      else dashedRow(doc, tableX, lineY - 10, tableW);

      doc.font(isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(isTotal ? 10.6 : 9.6);
      doc.fillColor("#0F172A").text(r.label, tableX, y, { width: labelW });
      doc.font(isTotal ? "Helvetica-Bold" : "Helvetica").fillColor("#0F172A").text(r.value, tableX + labelW, y, {
        width: valueW,
        align: "right"
      });
      y += rowH;
    }
    doc.y = y + 8;

    // GL reference section (light background)
    const glY = doc.y;
    const glH = 56;
    doc.save();
    doc.roundedRect(tableX, glY, tableW, glH, 10).fill("#F8FAFC");
    doc.restore();

    const mono = "Courier";
    const glPad = 12;
    const glLeftX = tableX + glPad;
    const glTop = glY + 12;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    doc.text("GL Reference", glLeftX, glTop);
    doc.text("Receipt Reference", glLeftX, glTop + 16);
    doc.text("Currency", glLeftX + tableW * 0.52, glTop);
    doc.text("Period", glLeftX + tableW * 0.52, glTop + 16);

    doc.font(mono).fontSize(9.2).fillColor("#0F172A");
    doc.text(String(receipt.glReference || additional?.glReference || "—"), glLeftX + 110, glTop, { width: tableW * 0.40 });
    doc.text(String(receipt.referenceNumber), glLeftX + 110, glTop + 16, { width: tableW * 0.40 });
    doc.text(String(receipt.currency || "EUR"), glLeftX + tableW * 0.52 + 56, glTop, { width: tableW * 0.30 });
    doc.text(monthYearLabelUtc(receipt.transactionDate), glLeftX + tableW * 0.52 + 56, glTop + 16, { width: tableW * 0.30 });

    doc.y = glY + glH + 14;

    // Closing message (italic) + gold decorative line
    doc.save();
    doc.strokeColor("#B78E2D").lineWidth(2);
    doc.moveTo(m, doc.y).lineTo(m + 90, doc.y).stroke();
    doc.restore();
    doc.moveDown(0.6);

    doc.font("Helvetica-Oblique").fontSize(9.8).fillColor("#334155").text(closingMessage(kind), { lineGap: 2 });

    // Footer pinned to bottom
    const footerH = 46;
    const footerY = pageH - doc.page.margins.bottom - footerH;
    doc.y = Math.max(doc.y + 12, footerY);

    // gold triangle bottom-right
    doc.save();
    doc.fillColor("#B78E2D").opacity(0.9);
    const triSize = 26;
    doc.moveTo(pageW - m, pageH - m);
    doc.lineTo(pageW - m - triSize, pageH - m);
    doc.lineTo(pageW - m, pageH - m - triSize);
    doc.closePath();
    doc.fill();
    doc.restore();

    doc.font("Helvetica-Oblique").fontSize(8.3).fillColor("#64748b").text(
      "System-generated receipt. For assistance contact: receipts@zweck.co",
      m,
      footerY + 12,
      { width: contentW * 0.65 }
    );
    doc.font("Helvetica").fontSize(8.5).fillColor("#334155").text(`Posted By: ${model.sessionUsername || model.postedBy || "System"}`, m, footerY + 12, {
      width: contentW,
      align: "right"
    });

    doc.end();
  });
}

