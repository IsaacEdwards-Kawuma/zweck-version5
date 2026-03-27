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
 * @param {object} directorsBlock - directors summary from /portfolio
 */
export function buildGeneralDirectorsCsv(p, directorsBlock) {
  const lines = [
    ["ZweckOS — Directors equity statement"],
    [`Generated ${new Date().toISOString()}`],
    [],
    ["Total assets (EUR)", eurPlain(p.totalAssets)],
    ["Total director equity (EUR)", eurPlain(directorsBlock.totalEquity)],
    ["Total contributed capital (EUR)", eurPlain(directorsBlock.totalCapital)],
    ["Directors (count)", String(directorsBlock.count)],
    [],
    [
      "Name",
      "Email",
      "Active",
      "Capital (EUR)",
      "Side fund (EUR)",
      "Total stake (EUR)",
      "Equity share %",
      "Capital share %"
    ]
  ];
  for (const d of directorsBlock.list || []) {
    lines.push([
      d.name,
      d.email,
      d.active ? "Yes" : "No",
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
 * @param {object} directorsBlock - directors summary from /portfolio
 */
export function buildDirectorStatementCsv(d, p, directorsBlock) {
  const lines = [
    ["ZweckOS — Director statement"],
    [`Generated ${new Date().toISOString()}`],
    [],
    ["Director", d.name],
    ["Email", d.email],
    ["Initials", d.initials],
    ["Status", d.active ? "Active" : "Inactive"],
    [],
    ["Pool reference (all directors)"],
    ["Total director equity (EUR)", eurPlain(directorsBlock.totalEquity)],
    ["Total contributed capital (EUR)", eurPlain(directorsBlock.totalCapital)],
    ["Total assets — organisation (EUR)", eurPlain(p.totalAssets)],
    [],
    ["This director"],
    ["Capital (EUR)", eurPlain(d.capital)],
    ["Side fund (EUR)", eurPlain(d.sideFund)],
    ["Total stake (EUR)", eurPlain(d.total)],
    ["Share of director equity", fmtPct01(d.equityShare, 2)],
    ["Share of contributed capital", fmtPct01(d.capitalShare, 2)]
  ];
  return rowsToCsv(lines);
}

function printStyles() {
  return `
    :root {
      --brand-dark: #0b2547;
      --brand-mid: #1d4e89;
      --brand-accent: #c9a227;
      --line-soft: #e2e8f0;
      --paper-soft: #f8fbff;
    }
    @page { margin: 12mm 12mm; size: A4; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.45;
      margin: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    .doc { max-width: 980px; margin: 0 auto; padding: 2px 4px; }

    .letterhead {
      border-radius: 12px;
      padding: 14px 16px;
      color: #ffffff;
      background: linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-mid) 62%, var(--brand-accent) 160%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.15);
    }
    .letterhead__brand {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #dbeafe;
      margin-bottom: 6px;
    }
    .letterhead__title {
      font-size: 22px;
      font-weight: 800;
      margin: 0;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .letterhead__meta {
      margin-top: 7px;
      font-size: 10px;
      color: #dbeafe;
    }

    .rule {
      height: 4px;
      margin: 14px 0 16px;
      background: linear-gradient(90deg, var(--brand-dark) 0%, var(--brand-mid) 60%, var(--brand-accent) 100%);
      border: 0;
      border-radius: 999px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin: 18px 0 22px;
    }
    @media print {
      .summary { break-inside: avoid; page-break-inside: avoid; }
    }
    .summary-card {
      border: 1px solid var(--line-soft);
      border-radius: 10px;
      padding: 10px 12px;
      background: linear-gradient(180deg, var(--paper-soft) 0%, #ffffff 100%);
    }
    .summary-card__label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--brand-mid);
    }
    .summary-card__value {
      margin-top: 4px;
      font-size: 16px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--brand-dark);
    }

    .section-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--brand-mid);
      margin: 18px 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--line-soft);
    }

    table.data,
    table.kv {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 10px;
      margin-bottom: 16px;
      border: 1px solid var(--line-soft);
      border-radius: 10px;
      overflow: hidden;
    }
    table.data thead th,
    table.kv thead th {
      background: var(--brand-dark);
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      padding: 9px 10px;
    }
    table.data thead th.num,
    table.kv thead th.num { text-align: right; }

    table.data tbody td,
    table.kv tbody td {
      padding: 8px 10px;
      vertical-align: middle;
      border-bottom: 1px solid var(--line-soft);
    }
    table.data tbody tr:last-child td,
    table.kv tbody tr:last-child td { border-bottom: 0; }

    tbody tr:nth-child(even) td { background: #f9f4e5; }

    .num { text-align: right; font-variant-numeric: tabular-nums; }

    table.kv .num { font-weight: 700; color: #0f172a; }

    .footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
      letter-spacing: 0.02em;
    }
    .signatures {
      margin-top: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
    }
    .sig-card {
      border: 1px solid var(--line-soft);
      border-radius: 10px;
      background: linear-gradient(180deg, #ffffff 0%, var(--paper-soft) 100%);
      padding: 10px 12px;
    }
    .sig-title {
      font-size: 10px;
      color: var(--brand-mid);
      text-transform: uppercase;
      letter-spacing: .06em;
      font-weight: 700;
      margin-bottom: 26px;
    }
    .sig-line {
      border-top: 2px solid var(--brand-mid);
      padding-top: 6px;
      color: #0f172a;
      font-size: 12px;
      font-weight: 700;
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

export function openPrintableStatement(title, innerHtml, companyInfo) {
  const w = window.open("", "_blank");
  if (!w) return;
  const companyName = companyInfo?.companyName || "Zweck Co. Ltd";
  const companyLocation = companyInfo?.companyLocation || "Kampala, Uganda";
  const productName = companyInfo?.productName || "ZweckOS";
  w.document.write(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escapeHtml(title)}</title><style>${printStyles()}</style></head><body><div class="doc">${innerHtml}<p class="footer">${escapeHtml(
      companyName
    )} · ${escapeHtml(companyLocation)} · ${escapeHtml(productName)} · Internal use only</p></div></body></html>`
  );
  w.document.close();
  w.focus();
  requestAnimationFrame(() => {
    w.print();
  });
}

function letterhead(docTitle, metaLine, companyInfo) {
  const companyName = companyInfo?.companyName || "Zweck Co. Ltd";
  const companyLocation = companyInfo?.companyLocation || "Kampala, Uganda";
  return `
    <header class="letterhead">
      <div class="letterhead__brand">${escapeHtml(companyName)} · ${escapeHtml(companyLocation.split(",")[0] || companyLocation)}</div>
      <h1 class="letterhead__title">${escapeHtml(docTitle)}</h1>
      <div class="letterhead__meta">${escapeHtml(metaLine)}</div>
    </header>
  `;
}

function signatureSection(companyInfo) {
  const preparedBy = companyInfo?.preparedBy || "Director Signature:";
  const authorisedBy = companyInfo?.authorisedBy || "Authorised - Treasurer:";
  return `
    <div class="signatures">
      <div class="sig-card">
        <div class="sig-title">Prepared by</div>
        <div class="sig-line">${escapeHtml(preparedBy)}</div>
      </div>
      <div class="sig-card">
        <div class="sig-title">Authorised by</div>
        <div class="sig-line">${escapeHtml(authorisedBy)}</div>
      </div>
    </div>
  `;
}

/**
 * @param {object} p
 * @param {object} directorsBlock
 */
export function printGeneralDirectorsStatement(p, directorsBlock, companyInfo) {
  const rows = (directorsBlock.list || [])
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

  const meta = `Generated ${new Date().toLocaleString()} · ${directorsBlock.list?.length || 0} director(s) · EUR`;

  const html = `
    ${letterhead("Directors equity statement", meta, companyInfo)}
    <div class="rule"></div>
    <div class="summary">
      <div class="summary-card">
        <div class="summary-card__label">Total director equity</div>
        <div class="summary-card__value">${eurPlain(directorsBlock.totalEquity)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Contributed capital</div>
        <div class="summary-card__value">${eurPlain(directorsBlock.totalCapital)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Organisation assets</div>
        <div class="summary-card__value">${eurPlain(p.totalAssets)} €</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__label">Directors</div>
        <div class="summary-card__value">${directorsBlock.count} <span style="font-size:11px;font-weight:600;color:#64748b">(${directorsBlock.activeCount} active)</span></div>
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
    ${signatureSection(companyInfo)}
  `;
  openPrintableStatement("Directors statement", html, companyInfo);
}

/**
 * @param {object} d
 * @param {object} p
 * @param {object} directorsBlock
 */
export function printDirectorStatement(d, p, directorsBlock, companyInfo) {
  const meta = `${escapeHtml(d.name)} · Generated ${new Date().toLocaleString()} · EUR`;

  const html = `
    ${letterhead("Director equity statement", meta, companyInfo)}
    <div class="rule"></div>
    <div class="section-title">Director profile</div>
    <table class="kv">
      <tbody>
        <tr><th colspan="2">${escapeHtml(d.name)} (${escapeHtml(d.initials)})</th></tr>
        <tr><td>Email</td><td>${escapeHtml(d.email)}</td></tr>
        <tr><td>Status</td><td>${d.active ? "Active" : "Inactive"}</td></tr>
      </tbody>
    </table>
    <div class="section-title">This director&apos;s position</div>
    <table class="kv">
      <tbody>
        <tr><td>Capital</td><td class="num">${eurPlain(d.capital)} €</td></tr>
        <tr><td>Side fund</td><td class="num">${eurPlain(d.sideFund)} €</td></tr>
        <tr><td>Total stake</td><td class="num">${eurPlain(d.total)} €</td></tr>
        <tr><td>Share of director equity</td><td class="num">${fmtPct01(d.equityShare, 2)}</td></tr>
        <tr><td>Share of contributed capital</td><td class="num">${fmtPct01(d.capitalShare, 2)}</td></tr>
      </tbody>
    </table>
    <div class="section-title">Organisation reference (all directors)</div>
    <table class="kv">
      <tbody>
        <tr><td>Total director equity</td><td class="num">${eurPlain(directorsBlock.totalEquity)} €</td></tr>
        <tr><td>Total contributed capital</td><td class="num">${eurPlain(directorsBlock.totalCapital)} €</td></tr>
        <tr><td>Total assets (Bank and project-linked assets)</td><td class="num">${eurPlain(p.totalAssets)} €</td></tr>
      </tbody>
    </table>
    ${signatureSection(companyInfo)}
  `;
  openPrintableStatement(`Statement — ${d.name}`, html, companyInfo);
}
