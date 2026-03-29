import { formatMoney } from "./format";

function escapeHtml(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Preserves line breaks for description / notes in HTML output. */
function escapeMultiline(s) {
  if (s == null || s === "") return "—";
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

function kindLabel(k) {
  if (k === "REQUISITION") return "Requisition";
  if (k === "GENERAL_REQUEST") return "General request";
  if (k === "TRANSACTION_RECEIPT") return "Expense / receipt (treasurer → ledger)";
  if (k === "ACKNOWLEDGEMENT") return "Acknowledgement";
  return String(k);
}

function requesterName(row) {
  const d = row.requestedBy?.director?.name;
  if (d) return d;
  if (row.requestedBy?.email) return row.requestedBy.email;
  return `User #${row.requestedById}`;
}

function reviewerLine(row) {
  if (row.reviewedBy?.email) return row.reviewedBy.email;
  if (row.reviewedById) return `User #${row.reviewedById}`;
  return "—";
}

function rowPair(label, valueHtml, { multiline = false } = {}) {
  const th =
    "font-weight:600;text-align:left;padding:10px 14px;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;width:34%;vertical-align:top;font-size:11px;letter-spacing:0.02em;text-transform:uppercase;";
  const tdBase = "padding:10px 14px;border:1px solid #cbd5e1;color:#0f172a;font-size:13px;line-height:1.45;";
  const td = multiline ? `${tdBase}vertical-align:top;` : tdBase;
  return `<tr class="doc-row" style="page-break-inside:avoid;"><th style="${th}">${escapeHtml(label)}</th><td style="${td}">${valueHtml}</td></tr>`;
}

/**
 * Printable / downloadable HTML for an approved internal form (requisition or general request).
 * @param {object} row — API row from GET /internal-forms
 */
export function buildApprovedFormHtml(row) {
  const amountLine =
    row.amount != null && row.currency
      ? formatMoney(row.amount, row.currency)
      : "—";
  const decided = row.decidedAt ? new Date(row.decidedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const submitted = row.createdAt ? new Date(row.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const generated = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const receiptCell =
    row.receiptUrl && String(row.receiptUrl).trim()
      ? `<a href="${escapeHtml(String(row.receiptUrl))}" style="color:#1d4ed8;font-weight:600;">${escapeHtml(row.receiptFileName || "View receipt")}</a> <span style="color:#64748b;font-size:11px;">(open in ZweckOS while online)</span>`
      : "—";

  const requestRows = [
    rowPair("Reference", escapeHtml(`#${String(row.id)}`)),
    rowPair("Form type", escapeHtml(kindLabel(row.kind))),
    rowPair("Title", escapeHtml(row.title || "—")),
    rowPair("Details", escapeMultiline(row.description), { multiline: true }),
    rowPair("Amount", escapeHtml(amountLine)),
    rowPair("Purpose / budget line", escapeHtml(row.purpose || "—")),
    rowPair("Vendor / payee", escapeHtml(row.vendor || "—")),
    rowPair("Receipt on file", receiptCell),
    rowPair("Requested by", escapeHtml(requesterName(row))),
    rowPair("Date submitted", escapeHtml(submitted))
  ].join("");

  const acknowledgementNote =
    row.kind === "ACKNOWLEDGEMENT"
      ? `<div class="footer-note" style="margin-bottom:16px;background:#f0fdfa;border-color:#5eead4;">
        <strong style="color:#0f766e;">Acknowledgement.</strong> The requester attests to the statement above. The approver confirms this record may be filed as proof of acknowledgement. Retain this printout with policies, training records, or handover documentation as needed.
      </div>`
      : "";

  const treasurerNote =
    row.kind === "TRANSACTION_RECEIPT"
      ? `<div class="footer-note" style="margin-bottom:16px;background:#eff6ff;border-color:#93c5fd;">
        <strong style="color:#1e3a8a;">Treasurer.</strong> This approval authorizes posting the matching amount in <strong>Post transaction</strong> / ledger. Keep this printout with your files; the uploaded receipt remains in ZweckOS under Forms.
      </div>`
      : "";

  const approvalRows = [
    rowPair("Decision", '<strong style="color:#047857;">Approved</strong>'),
    rowPair("Approved on", escapeHtml(decided)),
    rowPair("Approved by (treasurer / admin)", escapeHtml(reviewerLine(row))),
    rowPair("Reviewer note", escapeMultiline(row.reviewNote), { multiline: true })
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>ZweckOS — ${row.kind === "ACKNOWLEDGEMENT" ? "Acknowledgement" : "Approved form"} #${row.id}</title>
<style>
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    margin: 0;
    padding: 0;
    font-size: 14px;
    line-height: 1.5;
  }
  .sheet {
    max-width: 800px;
    margin: 24px auto;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
    overflow: hidden;
  }
  .head {
    background: linear-gradient(135deg, #1e40af 0%, #0d9488 100%);
    color: #fff;
    padding: 28px 32px 24px;
  }
  .head-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.92;
    margin-bottom: 8px;
  }
  .head-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0 0 6px;
    line-height: 1.25;
  }
  .head-sub {
    font-size: 13px;
    opacity: 0.9;
    margin: 0;
  }
  .stamp {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    padding: 8px 16px;
    background: rgba(255,255,255,0.2);
    border: 2px solid rgba(255,255,255,0.85);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .stamp svg { flex-shrink: 0; opacity: 0.95; }
  .body { padding: 28px 32px 32px; }
  .section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #e2e8f0;
  }
  .section-label + table { margin-top: 0; }
  table.doc-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 28px;
  }
  .footer-note {
    margin-top: 8px;
    padding: 14px 16px;
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    font-size: 11px;
    color: #64748b;
    line-height: 1.5;
  }
  .footer-note strong { color: #475569; }
  .sign-off {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    font-size: 12px;
    color: #64748b;
  }
  .sign-off .line {
    margin-top: 36px;
    border-top: 1px solid #94a3b8;
    padding-top: 6px;
  }
  .no-print { }
  @media print {
    @page {
      size: A4;
      margin: 14mm 16mm;
    }
    body {
      background: #fff;
      padding: 0;
    }
    .sheet {
      margin: 0;
      max-width: none;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }
    .head {
      padding: 20px 24px 18px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .body { padding: 20px 24px 24px; }
    .no-print { display: none !important; }
    table.doc-table { font-size: 12px; }
    .sign-off { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <div class="head-eyebrow">Zweck Co. Ltd · Kampala</div>
      <h1 class="head-title">${row.kind === "ACKNOWLEDGEMENT" ? "Acknowledgement — approval record" : "Internal request — approval record"}</h1>
      <p class="head-sub">${
        row.kind === "ACKNOWLEDGEMENT"
          ? "This document certifies that the acknowledgement below was reviewed and <strong>approved</strong> in ZweckOS."
          : "This document certifies that the request below was reviewed and <strong>approved</strong> in ZweckOS."
      }</p>
      <div class="stamp" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
        APPROVED
      </div>
    </header>
    <div class="body">
      <h2 class="section-label">Request details</h2>
      <table class="doc-table" role="presentation">${requestRows}</table>

      <h2 class="section-label">Authorization</h2>
      <table class="doc-table" role="presentation">${approvalRows}</table>

      ${acknowledgementNote}
      ${treasurerNote}

      <div class="footer-note">
        <strong>Verification.</strong> Reference <strong>#${row.id}</strong> — retain this copy for your records.
        Electronic record in ZweckOS under <em>Forms</em> remains the system of record.
      </div>

      <div class="sign-off">
        <div>
          <div>Requester acknowledgment (optional)</div>
          <div class="line">Name &amp; date</div>
        </div>
        <div>
          <div>Approver signature (optional)</div>
          <div class="line">Name &amp; date</div>
        </div>
      </div>

      <p class="no-print" style="margin:20px 0 0;font-size:11px;color:#94a3b8;">Screen preview · Generated ${escapeHtml(generated)} · Print or save as PDF from your browser.</p>
    </div>
  </div>
</body>
</html>`;
}

export function downloadApprovedForm(row) {
  const html = buildApprovedFormHtml(row);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zweck-approved-form-${row.id}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printApprovedForm(row) {
  const html = buildApprovedFormHtml(row);
  const w = window.open("", "_blank", "noopener,noreferrer,width=880,height=980");
  if (!w) {
    window.alert("Pop-up blocked. Allow pop-ups for this site to print, or use Download.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  const trigger = () => {
    try {
      w.print();
    } catch {
      /* ignore */
    }
  };
  if (w.document.readyState === "complete") {
    setTimeout(trigger, 300);
  } else {
    w.onload = () => setTimeout(trigger, 300);
  }
}
