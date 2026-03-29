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

/**
 * Printable / downloadable HTML for an approved internal form (requisition or general request).
 * @param {object} row — API row from GET /internal-forms
 */
export function buildApprovedFormHtml(row) {
  const amountLine =
    row.amount != null && row.currency
      ? formatMoney(row.amount, row.currency)
      : "—";
  const decided = row.decidedAt ? new Date(row.decidedAt).toLocaleString() : "—";
  const submitted = row.createdAt ? new Date(row.createdAt).toLocaleString() : "—";

  const th = "text-align:left;padding:8px 12px;border:1px solid #ccc;background:#f8fafc;width:32%;";
  const td = "padding:8px 12px;border:1px solid #ccc;";
  const tdTop = `${td}vertical-align:top;`;

  const rowsHtml = [
    `<tr><th style="${th}">${escapeHtml("Reference ID")}</th><td style="${td}">${escapeHtml(String(row.id))}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Type")}</th><td style="${td}">${escapeHtml(kindLabel(row.kind))}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Title")}</th><td style="${tdTop}">${escapeHtml(row.title || "—")}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Details")}</th><td style="${tdTop}">${escapeMultiline(row.description)}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Amount")}</th><td style="${td}">${escapeHtml(amountLine)}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Purpose / budget line")}</th><td style="${td}">${escapeHtml(row.purpose || "—")}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Vendor / payee")}</th><td style="${td}">${escapeHtml(row.vendor || "—")}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Requested by")}</th><td style="${td}">${escapeHtml(requesterName(row))}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Submitted")}</th><td style="${td}">${escapeHtml(submitted)}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Approved on")}</th><td style="${td}">${escapeHtml(decided)}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Approved by")}</th><td style="${td}">${escapeHtml(reviewerLine(row))}</td></tr>`,
    `<tr><th style="${th}">${escapeHtml("Treasurer / reviewer note")}</th><td style="${tdTop}">${escapeMultiline(row.reviewNote)}</td></tr>`
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ZweckOS — Approved form #${row.id}</title>
<style>
  body { font-family: system-ui, Segoe UI, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 0.9rem; margin-bottom: 20px; }
  .badge { display: inline-block; background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; max-width: 720px; font-size: 0.95rem; }
  @media print {
    body { padding: 12px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="badge">APPROVED</div>
  <h1>Zweck Co. Ltd — Internal form record</h1>
  <p class="sub">Kampala · ZweckOS · This document reflects an approved request on file.</p>
  <table>${rowsHtml}</table>
  <p class="no-print" style="margin-top:24px;font-size:0.85rem;color:#64748b;">Generated ${new Date().toLocaleString()}</p>
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
  const w = window.open("", "_blank", "noopener,noreferrer,width=840,height=960");
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
    setTimeout(trigger, 250);
  } else {
    w.onload = () => setTimeout(trigger, 250);
  }
}
