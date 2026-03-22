/** @param {unknown} value */
export function escapeCsv(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {(string|number)[][]} rows */
export function rowsToCsv(rows) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

export function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fmtPct01(fraction, digits = 2) {
  const n = Number(fraction || 0) * 100;
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
}

export function eurPlain(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {object} p - portfolio API payload
 * @param {object} members - members block
 */
export function buildGeneralDirectorsCsv(p, members) {
  const lines = [
    ["ZweckOS — Directors equity statement"],
    [`Generated ${new Date().toISOString()}`],
    [],
    ["Total assets (EUR)", eurPlain(p.totalAssets)],
    ["Total member equity (EUR)", eurPlain(members.totalEquity)],
    ["Total contributed capital (EUR)", eurPlain(members.totalCapital)],
    ["Directors (count)", String(members.count)],
    [],
    [
      "Name",
      "Email",
      "Active",
      "Joined round",
      "Capital (EUR)",
      "Side fund (EUR)",
      "Total stake (EUR)",
      "Equity share %",
      "Capital share %"
    ]
  ];
  for (const d of members.directors || []) {
    lines.push([
      d.name,
      d.email,
      d.active ? "Yes" : "No",
      String(d.joinedRound),
      eurPlain(d.capital),
      eurPlain(d.sideFund),
      eurPlain(d.total),
      fmtPct01(d.equityShare, 2),
      fmtPct01(d.capitalShare, 2)
    ]);
  }
  return rowsToCsv(lines);
}

/**
 * @param {object} d - single director from API
 * @param {object} p - portfolio
 * @param {object} members - members block
 */
export function buildDirectorStatementCsv(d, p, members) {
  const lines = [
    ["ZweckOS — Director statement"],
    [`Generated ${new Date().toISOString()}`],
    [],
    ["Director", d.name],
    ["Email", d.email],
    ["Initials", d.initials],
    ["Status", d.active ? "Active" : "Inactive"],
    ["Joined round", String(d.joinedRound)],
    [],
    ["Pool reference (all directors)"],
    ["Total member equity (EUR)", eurPlain(members.totalEquity)],
    ["Total contributed capital (EUR)", eurPlain(members.totalCapital)],
    ["Total assets — organisation (EUR)", eurPlain(p.totalAssets)],
    [],
    ["This director"],
    ["Capital (EUR)", eurPlain(d.capital)],
    ["Side fund (EUR)", eurPlain(d.sideFund)],
    ["Total stake (EUR)", eurPlain(d.total)],
    ["Share of member equity", fmtPct01(d.equityShare, 2)],
    ["Share of contributed capital", fmtPct01(d.capitalShare, 2)]
  ];
  return rowsToCsv(lines);
}

function printStyles() {
  return `
    @page { margin: 14mm 16mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.45;
      margin: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .doc { max-width: 760px; margin: 0 auto; }
    .letterhead {
      border-bottom: 3px solid #1e3a5f;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .letterhead__brand {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #1e40af;
      margin-bottom: 6px;
    }
    .letterhead__title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #0f172a;
      margin: 0;
      line-height: 1.2;
    }
    .letterhead__meta {
      margin-top: 8px;
      font-size: 10px;
      color: #64748b;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 22px;
    }
    @media print {
      .summary { break-inside: avoid; page-break-inside: avoid; }
    }
    .summary-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    }
    .summary-card__label {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
    }
    .summary-card__value {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #0f172a;
      margin-top: 4px;
    }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #475569;
      margin: 20px 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    table.data {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 16px;
    }
    table.data thead th {
      background: #1e3a5f;
      color: #ffffff;
      font-weight: 600;
      text-align: left;
      padding: 9px 10px;
      border: 1px solid #1e3a5f;
    }
    table.data thead th.num { text-align: right; }
    table.data tbody td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      vertical-align: middle;
    }
    table.data tbody tr:nth-child(even) td { background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    table.kv {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 16px;
    }
    table.kv th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
    }
    table.kv td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
    }
    table.kv .num { font-weight: 600; color: #0f172a; }
    table.totals {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-top: 8px;
    }
    table.totals td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
    }
    table.totals td:first-child {
      font-weight: 500;
      color: #475569;
      width: 58%;
      background: #fafbfc;
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
      letter-spacing: 0.02em;
    }
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openPrintableStatement(title, innerHtml) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escapeHtml(title)}</title><style>${printStyles()}</style></head><body><div class="doc">${innerHtml}<p class="footer">Zweck Co. Ltd · Kampala, Uganda · ZweckOS · Internal use only</p></div></body></html>`
  );
  w.document.close();
  w.focus();
  requestAnimationFrame(() => {
    w.print();
  });
}

function letterhead(docTitle, metaLine) {
  return `
    <header class="letterhead">
      <div class="letterhead__brand">Zweck Co. Ltd · Kampala</div>
      <h1 class="letterhead__title">${escapeHtml(docTitle)}</h1>
      <div class="letterhead__meta">${escapeHtml(metaLine)}</div>
    </header>
  `;
}

/**
 * @param {object} p
 * @param {object} members
 */
export function printGeneralDirectorsStatement(p, members) {
  const rows = (members.directors || [])
    .map(
      (d) => `<tr>
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.email)}</td>
      <td>${d.active ? "Active" : "Inactive"}</td>
      <td class="num">${eurPlain(d.capital)}</td>
      <td class="num">${eurPlain(d.sideFund)}</td>
      <td class="num">${eurPlain(d.total)}</td>
      <td class="num">${fmtPct01(d.equityShare, 2)}</td>
      <td class="num">${fmtPct01(d.capitalShare, 2)}</td>
    </tr>`
    )
    .join("");

  const meta = `Generated ${new Date().toLocaleString()} · ${members.directors?.length || 0} director(s) · EUR`;

  const html = `
    ${letterhead("Directors equity statement", meta)}
    <div class="summary">
      <div class="summary-card">
        <div class="summary-card__label">Total member equity</div>
        <div class="summary-card__value">${eurPlain(members.totalEquity)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Contributed capital</div>
        <div class="summary-card__value">${eurPlain(members.totalCapital)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Organisation assets</div>
        <div class="summary-card__value">${eurPlain(p.totalAssets)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Directors</div>
        <div class="summary-card__value">${members.count} <span style="font-size:11px;font-weight:600;color:#64748b">(${members.activeCount} active)</span></div>
      </div>
    </div>
    <div class="section-title">Detail by director</div>
    <table class="data">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Status</th>
        <th class="num">Capital</th><th class="num">Side fund</th><th class="num">Total stake</th>
        <th class="num">Equity %</th><th class="num">Capital %</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  openPrintableStatement("Directors statement — ZweckOS", html);
}

/**
 * @param {object} d
 * @param {object} p
 * @param {object} members
 */
export function printDirectorStatement(d, p, members) {
  const meta = `${escapeHtml(d.name)} · Generated ${new Date().toLocaleString()} · EUR`;

  const html = `
    ${letterhead("Member equity statement", meta)}
    <div class="section-title">Member profile</div>
    <table class="kv">
      <tbody>
        <tr><th colspan="2">${escapeHtml(d.name)} (${escapeHtml(d.initials)})</th></tr>
        <tr><td>Email</td><td>${escapeHtml(d.email)}</td></tr>
        <tr><td>Status</td><td>${d.active ? "Active" : "Inactive"}</td></tr>
        <tr><td>Joined round</td><td>${d.joinedRound}</td></tr>
      </tbody>
    </table>
    <div class="section-title">This member's position</div>
    <table class="kv">
      <tbody>
        <tr><td>Capital</td><td class="num">${eurPlain(d.capital)} €</td></tr>
        <tr><td>Side fund</td><td class="num">${eurPlain(d.sideFund)} €</td></tr>
        <tr><td>Total stake</td><td class="num">${eurPlain(d.total)} €</td></tr>
        <tr><td>Share of member equity</td><td class="num">${fmtPct01(d.equityShare, 2)}</td></tr>
        <tr><td>Share of contributed capital</td><td class="num">${fmtPct01(d.capitalShare, 2)}</td></tr>
      </tbody>
    </table>
    <div class="section-title">Organisation reference (all members)</div>
    <table class="kv">
      <tbody>
        <tr><td>Total member equity</td><td class="num">${eurPlain(members.totalEquity)} €</td></tr>
        <tr><td>Total contributed capital</td><td class="num">${eurPlain(members.totalCapital)} €</td></tr>
        <tr><td>Total assets (Bank + MMF + YPA)</td><td class="num">${eurPlain(p.totalAssets)} €</td></tr>
      </tbody>
    </table>
  `;
  openPrintableStatement(`Statement — ${d.name}`, html);
}
