import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import MetricCard from "../components/MetricCard";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { listTransactions } from "../api/transactions";
import { trackReportEvent } from "../api/reports";
import { listDirectors } from "../api/directors";
import { eur, eurCompact, fmtDate } from "../lib/format";
import { TX_TYPE_LABELS } from "../lib/dashboardAnalytics";
import { useDirectorsAll, useSummary } from "../hooks/useDashboard";
import {
  filterByDateRange,
  aggregateReportByMonth,
  aggregateByTypeTotals,
  reportPeriodKpis,
  incomeExpenseMix,
  downloadTransactionsCsv
} from "../lib/reportsAnalytics";
import { useDarkClass } from "../lib/useDarkClass";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";

const PIE_COLORS = ["#22c55e", "#0ea5e9", "#a855f7", "#f97316", "#ec4899", "#64748b"];
const OPERATING_EXPENSE_TYPES = new Set(["REGISTRATION", "TX_CHARGE", "LEGAL", "OTHER_OUT"]);
const OPERATING_INCOME_TYPES = new Set(["PENALTY", "MMF_RETURN"]);
const FINANCING_INFLOW_TYPES = new Set(["CONTRIBUTION", "SIDE_FUND", "LOAN_IN"]);
const INVESTING_OUTFLOW_TYPES = new Set(["MMF_DEPLOY", "YPA_INVEST"]);

function downloadSimpleCsv(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_COMPANY_NAME = "YOUR COMPANY NAME";
const PRINT_COMPANY_LOCATION = "Your city, Your country";
const PRINT_PREPARED_BY = "Director Signature:";
const PRINT_AUTHORISED_BY = "Authorised – Treasurer:";

function makeStatementRef(statementCode, mode, from, to) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const fromPart = (from || "ALL").replaceAll("-", "");
  const toPart = (to || "ALL").replaceAll("-", "");
  return `${statementCode}-${today}-${mode.toUpperCase()}-${fromPart}-${toPart}`;
}

function openPrintDocument(title, statementName, reportMeta, statementRef, innerHtml) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escHtml(title)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; background: #fff; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 2px 4px; }
      .top {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
        padding: 14px 16px;
        border-radius: 12px;
        color: #ffffff;
        background: linear-gradient(135deg, #0b2547 0%, #1d4e89 62%, #c9a227 160%);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.15);
      }
      .brand h1 { margin: 0; font-size: 34px; letter-spacing: 0.02em; color: #ffffff; line-height: 1; font-weight: 800; }
      .brand p { margin: 7px 0 0; color: #dbeafe; font-size: 12px; }
      .title { text-align: right; }
      .title h2 { margin: 0; font-size: 19px; color: #ffffff; letter-spacing: 0.02em; text-transform: uppercase; }
      .title .meta { margin-top: 8px; color: #dbeafe; font-size: 11px; }
      .rule { height: 4px; margin: 14px 0 16px; background: linear-gradient(90deg, #0b2547 0%, #1d4e89 60%, #c9a227 100%); border: 0; border-radius: 999px; }
      .summary {
        border: 1px solid #bfd2ea;
        background: linear-gradient(180deg, #eef5ff 0%, #f8fbff 100%);
        border-radius: 10px;
        padding: 12px 14px;
      }
      .summary .k { color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
      .summary .v { margin-top: 4px; font-size: 13px; color: #0b2547; font-weight: 600; }
      .section { margin-top: 16px; }
      .section h3 { margin: 0 0 8px; color: #0b2547; font-size: 18px; font-weight: 700; border-left: 4px solid #c9a227; padding-left: 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #cbd5e1; padding: 7px 8px; }
      th { background: #0b2547; color: #fff; text-align: left; }
      td.num, th.num { text-align: right; }
      tbody tr:nth-child(even) td { background: #f8fbff; }
      tr.total td { font-weight: 700; background: #fff5d6; color: #7a5600; }
      .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .card { border: 1px solid #bfd2ea; border-radius: 8px; padding: 10px; background: #f8fbff; }
      .card .k { font-size: 10px; color: #334155; text-transform: uppercase; letter-spacing: .05em; }
      .card .v { margin-top: 4px; font-size: 16px; font-weight: 700; color: #0b2547; }
      .signatures { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
      .sig-title { font-size: 12px; color: #0f172a; margin-bottom: 34px; }
      .sig-line { border-top: 2px solid #1d4e89; padding-top: 6px; color: #0f172a; font-size: 12px; font-weight: 600; }
      .footer { margin-top: 14px; display: flex; justify-content: space-between; gap: 20px; color: #475569; font-size: 11px; }
      @media print {
        .signatures { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <div class="brand">
          <h1>${escHtml(PRINT_COMPANY_NAME)}</h1>
          <p>${escHtml(PRINT_COMPANY_LOCATION)}</p>
        </div>
        <div class="title">
          <h2>${escHtml(statementName)}</h2>
          <div class="meta">Ref: ${escHtml(statementRef)}</div>
          <div class="meta">Generated: ${escHtml(new Date().toLocaleString())}</div>
        </div>
      </div>
      <div class="rule"></div>
      <div class="summary">
        <div class="k">Report Period</div>
        <div class="v">${escHtml(reportMeta)}</div>
      </div>
      ${innerHtml}
      <div class="signatures">
        <div>
          <div class="sig-title">Prepared by:</div>
          <div class="sig-line">${escHtml(PRINT_PREPARED_BY)}</div>
        </div>
        <div>
          <div class="sig-title">Authorised by:</div>
          <div class="sig-line">${escHtml(PRINT_AUTHORISED_BY)}</div>
        </div>
      </div>
      <div class="footer">
        <div>Prepared by: ZweckOS</div>
        <div>Print / Save as PDF</div>
      </div>
    </div>
  </body>
</html>`);
  w.document.close();
  w.focus();
  requestAnimationFrame(() => w.print());
}

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedDirectorId, setSelectedDirectorId] = useState("ALL");
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";

  const qSummary = useSummary();
  const qDirectors = useDirectorsAll();
  const qDirectorsFull = useQuery({
    queryKey: ["directors", "full", "reports"],
    queryFn: listDirectors
  });
  const qTx = useQuery({
    queryKey: ["transactions", "reports"],
    queryFn: () => listTransactions()
  });

  const rawTxs = useMemo(() => qTx.data ?? [], [qTx.data]);
  const txs = useMemo(() => filterByDateRange(rawTxs, from, to), [rawTxs, from, to]);
  const previousRange = useMemo(() => {
    if (!from || !to) return null;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    const fmt = (d) => d.toISOString().slice(0, 10);
    return { from: fmt(prevStart), to: fmt(prevEnd) };
  }, [from, to]);
  const previousTxs = useMemo(
    () => (previousRange ? filterByDateRange(rawTxs, previousRange.from, previousRange.to) : []),
    [rawTxs, previousRange]
  );
  const byMonth = useMemo(() => aggregateReportByMonth(txs), [txs]);
  const byType = useMemo(() => aggregateByTypeTotals(txs), [txs]);
  const kpis = useMemo(() => reportPeriodKpis(txs), [txs]);
  const previousKpis = useMemo(() => reportPeriodKpis(previousTxs), [previousTxs]);
  const mix = useMemo(() => incomeExpenseMix(txs), [txs]);
  const profitLoss = useMemo(() => {
    const income = [];
    const expenses = [];
    for (const row of byType) {
      if (OPERATING_INCOME_TYPES.has(row.type) || row.type === "LOAN_IN") {
        income.push({ label: row.name, amount: row.total });
      } else if (OPERATING_EXPENSE_TYPES.has(row.type)) {
        expenses.push({ label: row.name, amount: row.total });
      }
    }
    const totalIncome = income.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
    return { income, expenses, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
  }, [byType]);
  const cashFlow = useMemo(() => {
    let operatingIn = 0;
    let operatingOut = 0;
    let investingOut = 0;
    let financingIn = 0;
    for (const t of txs) {
      const amount = Number(t.amount) || 0;
      if (OPERATING_INCOME_TYPES.has(t.type)) operatingIn += amount;
      if (OPERATING_EXPENSE_TYPES.has(t.type)) operatingOut += amount;
      if (INVESTING_OUTFLOW_TYPES.has(t.type)) investingOut += amount;
      if (FINANCING_INFLOW_TYPES.has(t.type)) financingIn += amount;
    }
    const netOperating = operatingIn - operatingOut;
    const netInvesting = -investingOut;
    const netFinancing = financingIn;
    const netChange = netOperating + netInvesting + netFinancing;
    return { operatingIn, operatingOut, netOperating, investingOut, netInvesting, financingIn, netFinancing, netChange };
  }, [txs]);
  const cashOpeningClosing = useMemo(() => {
    if (!from) return { opening: null, closing: null };
    const priorTx = filterByDateRange(rawTxs, "", from).filter((t) => String(t.date).slice(0, 10) < from);
    const movement = (arr) =>
      arr.reduce((sum, t) => {
        const amount = Number(t.amount) || 0;
        if (OPERATING_INCOME_TYPES.has(t.type)) return sum + amount;
        if (OPERATING_EXPENSE_TYPES.has(t.type)) return sum - amount;
        if (INVESTING_OUTFLOW_TYPES.has(t.type)) return sum - amount;
        if (FINANCING_INFLOW_TYPES.has(t.type)) return sum + amount;
        return sum;
      }, 0);
    const opening = movement(priorTx);
    return { opening, closing: opening + cashFlow.netChange };
  }, [from, rawTxs, cashFlow.netChange]);
  const directorCapital = useMemo(() => {
    const rows = (qDirectors.data || []).map((d) => ({
      name: d.name,
      email: d.email,
      capital: Number(d.capital || 0),
      sideFund: Number(d.sideFund || 0),
      total: Number(d.total || 0)
    }));
    const totalCapital = rows.reduce((s, r) => s + r.capital, 0);
    const totalSideFund = rows.reduce((s, r) => s + r.sideFund, 0);
    const totalStake = rows.reduce((s, r) => s + r.total, 0);
    return { rows, totalCapital, totalSideFund, totalStake };
  }, [qDirectors.data]);
  const directorsFullMap = useMemo(() => {
    const m = new Map();
    for (const d of qDirectorsFull.data || []) m.set(String(d.id), d);
    return m;
  }, [qDirectorsFull.data]);
  const previousDirectorCapitalById = useMemo(() => {
    const map = new Map();
    for (const d of qDirectors.data || []) {
      map.set(String(d.id), { capital: 0, sideFund: 0, total: 0 });
    }
    for (const t of previousTxs) {
      const id = t.directorId;
      if (id == null) continue;
      const key = String(id);
      const cur = map.get(key) || { capital: 0, sideFund: 0, total: 0 };
      if (t.type === "CONTRIBUTION") cur.capital += Number(t.amount) || 0;
      if (t.type === "SIDE_FUND") cur.sideFund += Number(t.amount) || 0;
      cur.total = cur.capital + cur.sideFund;
      map.set(key, cur);
    }
    return map;
  }, [previousTxs, qDirectors.data]);
  const selectedDirectorStatement = useMemo(() => {
    if (selectedDirectorId === "ALL") return null;
    const row = (qDirectors.data || []).find((d) => String(d.id) === selectedDirectorId);
    if (!row) return null;
    const profile = directorsFullMap.get(String(row.id)) || {};
    const prev = previousDirectorCapitalById.get(String(row.id)) || { capital: 0, sideFund: 0, total: 0 };
    const openingCapital = prev.capital;
    const openingSideFund = prev.sideFund;
    const openingTotal = prev.total;
    const movementCapital = row.capital - prev.capital;
    const movementSideFund = row.sideFund - prev.sideFund;
    const movementTotal = row.total - prev.total;
    const movementRows = txs
      .filter((t) => String(t.directorId ?? "") === String(row.id))
      .map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        typeLabel: TX_TYPE_LABELS[t.type] || t.type.replaceAll("_", " "),
        description: t.description || "",
        amount: Number(t.amount) || 0
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return {
      id: row.id,
      name: row.name || "Unknown",
      role: "DIRECTOR",
      email: profile.email || row.email || "",
      phone: profile.phone || "",
      address: profile.address || "",
      joinedRound: profile.joinedRound ?? row.joinedRound ?? null,
      equitySharePct: Number(row.equitySharePct || 0),
      openingCapital,
      openingSideFund,
      openingTotal,
      movementCapital,
      movementSideFund,
      movementTotal,
      closingCapital: row.capital,
      closingSideFund: row.sideFund,
      closingTotal: row.total,
      previousTotal: prev.total,
      movementRows
    };
  }, [selectedDirectorId, qDirectors.data, directorsFullMap, previousDirectorCapitalById, txs]);
  const top10 = useMemo(() => {
    return [...txs]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [txs]);
  const monthlyTable = useMemo(() => {
    return byMonth.map((row) => ({
      ...row,
      net: row.income - row.expenses
    }));
  }, [byMonth]);

  if (qTx.isLoading || qSummary.isLoading || qDirectors.isLoading || qDirectorsFull.isLoading) {
    return <Loading label="Loading reports..." />;
  }
  if (qTx.error) return <ErrorBanner error={qTx.error} />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qDirectors.error) return <ErrorBanner error={qDirectors.error} />;
  if (qDirectorsFull.error) return <ErrorBanner error={qDirectorsFull.error} />;

  function clearRange() {
    setFrom("");
    setTo("");
  }

  const rangeLabel =
    from || to
      ? `${from || "…"} → ${to || "…"}`
      : "All dates";
  const reportMeta = `${new Date().toLocaleString()} · ${rangeLabel} · EUR`;
  const comparePct = (current, previous) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
    if (previous === 0) return current === 0 ? "0.0%" : "New";
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  async function logReportEvent(action, statement, mode) {
    try {
      await trackReportEvent({
        action,
        statement,
        mode,
        rangeFrom: from || null,
        rangeTo: to || null
      });
    } catch {
      // non-blocking logging
    }
  }

  async function printProfitLoss(mode) {
    if (!txs.length) {
      window.alert("No transactions in the selected range to print.");
      return;
    }
    const statementRef = makeStatementRef("PL", mode, from, to);
    const rows =
      mode === "summary"
        ? `
      <tr><td>Total income</td><td class="num">${escHtml(eur(profitLoss.totalIncome))}</td></tr>
      <tr><td>Total expenses</td><td class="num">${escHtml(eur(profitLoss.totalExpenses))}</td></tr>
      <tr class="total"><td>Net profit / (loss)</td><td class="num">${escHtml(eur(profitLoss.net))}</td></tr>
      <tr><td>Previous period net</td><td class="num">${escHtml(eur(previousKpis.net))}</td></tr>
      <tr><td>Variance vs previous</td><td class="num">${escHtml(comparePct(profitLoss.net, previousKpis.net))}</td></tr>
    `
        : `
      ${profitLoss.income.map((r) => `<tr><td>Income: ${escHtml(r.label)}</td><td class="num">${escHtml(eur(r.amount))}</td></tr>`).join("")}
      ${profitLoss.expenses.map((r) => `<tr><td>Expense: ${escHtml(r.label)}</td><td class="num">${escHtml(eur(r.amount))}</td></tr>`).join("")}
      <tr><td>Total income</td><td class="num">${escHtml(eur(profitLoss.totalIncome))}</td></tr>
      <tr><td>Total expenses</td><td class="num">${escHtml(eur(profitLoss.totalExpenses))}</td></tr>
      <tr class="total"><td>Net profit / (loss)</td><td class="num">${escHtml(eur(profitLoss.net))}</td></tr>
    `;
    openPrintDocument(
      `Profit and Loss (${mode})`,
      "Profit and Loss Statement",
      reportMeta,
      statementRef,
      `<div class="section"><h3>Capital Position</h3><table><thead><tr><th>Line Item</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
    await logReportEvent("PRINT", "PROFIT_LOSS", mode);
  }

  async function printBalanceSheet(mode) {
    const statementRef = makeStatementRef("BS", mode, from, to);
    const check = (qSummary.data?.assets ?? 0) - ((qSummary.data?.liabilities ?? 0) + (qSummary.data?.equity ?? 0));
    const body =
      mode === "summary"
        ? `<div class="cards">
            <div class="card"><div class="k">Assets</div><div class="v">${escHtml(eur(qSummary.data?.assets ?? 0))}</div></div>
            <div class="card"><div class="k">Liabilities</div><div class="v">${escHtml(eur(qSummary.data?.liabilities ?? 0))}</div></div>
            <div class="card"><div class="k">Equity</div><div class="v">${escHtml(eur(qSummary.data?.equity ?? 0))}</div></div>
          </div>
          <div class="section"><table><tbody><tr class="total"><td>Balancing check</td><td class="num">${escHtml(eur(check))}</td></tr></tbody></table></div>`
        : `<div class="section">
            <table><thead><tr><th>Section</th><th class="num">Amount</th></tr></thead><tbody>
              <tr><td>Assets</td><td class="num">${escHtml(eur(qSummary.data?.assets ?? 0))}</td></tr>
              <tr><td>Liabilities</td><td class="num">${escHtml(eur(qSummary.data?.liabilities ?? 0))}</td></tr>
              <tr><td>Equity</td><td class="num">${escHtml(eur(qSummary.data?.equity ?? 0))}</td></tr>
              <tr class="total"><td>Assets - (Liabilities + Equity)</td><td class="num">${escHtml(eur(check))}</td></tr>
            </tbody></table>
          </div>`;
    openPrintDocument(
      `Balance Sheet (${mode})`,
      "Balance Sheet",
      reportMeta,
      statementRef,
      `<div class="section"><h3>Position Summary</h3>${body}</div>`
    );
    await logReportEvent("PRINT", "BALANCE_SHEET", mode);
  }

  async function printCashFlow(mode) {
    if (!txs.length) {
      window.alert("No transactions in the selected range to print.");
      return;
    }
    const statementRef = makeStatementRef("CF", mode, from, to);
    const rows =
      mode === "summary"
        ? `
          <tr><td>Opening cash balance</td><td class="num">${escHtml(cashOpeningClosing.opening == null ? "—" : eur(cashOpeningClosing.opening))}</td></tr>
          <tr><td>Net cash from operating</td><td class="num">${escHtml(eur(cashFlow.netOperating))}</td></tr>
          <tr><td>Net cash from investing</td><td class="num">${escHtml(eur(cashFlow.netInvesting))}</td></tr>
          <tr><td>Net cash from financing</td><td class="num">${escHtml(eur(cashFlow.netFinancing))}</td></tr>
          <tr class="total"><td>Net cash change</td><td class="num">${escHtml(eur(cashFlow.netChange))}</td></tr>
          <tr><td>Closing cash balance</td><td class="num">${escHtml(cashOpeningClosing.closing == null ? "—" : eur(cashOpeningClosing.closing))}</td></tr>
        `
        : `
          <tr><td>Opening cash balance</td><td class="num">${escHtml(cashOpeningClosing.opening == null ? "—" : eur(cashOpeningClosing.opening))}</td></tr>
          <tr><td>Operating inflows</td><td class="num">${escHtml(eur(cashFlow.operatingIn))}</td></tr>
          <tr><td>Operating outflows</td><td class="num">${escHtml(eur(cashFlow.operatingOut))}</td></tr>
          <tr><td>Net cash from operating</td><td class="num">${escHtml(eur(cashFlow.netOperating))}</td></tr>
          <tr><td>Investing outflows</td><td class="num">${escHtml(eur(cashFlow.investingOut))}</td></tr>
          <tr><td>Net cash from investing</td><td class="num">${escHtml(eur(cashFlow.netInvesting))}</td></tr>
          <tr><td>Financing inflows</td><td class="num">${escHtml(eur(cashFlow.financingIn))}</td></tr>
          <tr><td>Net cash from financing</td><td class="num">${escHtml(eur(cashFlow.netFinancing))}</td></tr>
          <tr class="total"><td>Net cash change</td><td class="num">${escHtml(eur(cashFlow.netChange))}</td></tr>
          <tr><td>Closing cash balance</td><td class="num">${escHtml(cashOpeningClosing.closing == null ? "—" : eur(cashOpeningClosing.closing))}</td></tr>
        `;
    openPrintDocument(
      `Cash Flow (${mode})`,
      "Cash Flow Statement",
      reportMeta,
      statementRef,
      `<div class="section"><h3>Cash Movement</h3><table><thead><tr><th>Line Item</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
    await logReportEvent("PRINT", "CASH_FLOW", mode);
  }

  async function printDirectorCapital(mode) {
    if (!directorCapital.rows.length) {
      window.alert("No director capital data available to print.");
      return;
    }
    const statementRef = makeStatementRef("DCS", mode, from, to);
    if (selectedDirectorId !== "ALL") {
      if (!selectedDirectorStatement) {
        window.alert("Selected director not found in current report data.");
        return;
      }
      const missing = [];
      if (!selectedDirectorStatement.email) missing.push("email");
      if (!selectedDirectorStatement.phone) missing.push("phone");
      if (!selectedDirectorStatement.address) missing.push("address");
      if (missing.length) {
        window.alert(`Cannot print director statement. Missing: ${missing.join(", ")}.`);
        return;
      }
      const rowsSingle =
        mode === "summary"
          ? `
            <tr><td>Opening balance</td><td class="num">${escHtml(eur(selectedDirectorStatement.openingTotal))}</td></tr>
            <tr><td>Movement in period</td><td class="num">${escHtml(eur(selectedDirectorStatement.movementTotal))}</td></tr>
            <tr><td>Previous period closing</td><td class="num">${escHtml(eur(selectedDirectorStatement.previousTotal))}</td></tr>
            <tr><td>Variance vs previous period</td><td class="num">${escHtml(comparePct(selectedDirectorStatement.closingTotal, selectedDirectorStatement.previousTotal))}</td></tr>
            <tr class="total"><td>Closing balance</td><td class="num">${escHtml(eur(selectedDirectorStatement.closingTotal))}</td></tr>
          `
          : `
            <tr><td>Opening capital</td><td class="num">${escHtml(eur(selectedDirectorStatement.openingCapital))}</td></tr>
            <tr><td>Opening side fund</td><td class="num">${escHtml(eur(selectedDirectorStatement.openingSideFund))}</td></tr>
            <tr><td>Opening total</td><td class="num">${escHtml(eur(selectedDirectorStatement.openingTotal))}</td></tr>
            <tr><td>Capital movement</td><td class="num">${escHtml(eur(selectedDirectorStatement.movementCapital))}</td></tr>
            <tr><td>Side fund movement</td><td class="num">${escHtml(eur(selectedDirectorStatement.movementSideFund))}</td></tr>
            <tr><td>Total movement</td><td class="num">${escHtml(eur(selectedDirectorStatement.movementTotal))}</td></tr>
            <tr><td>Previous period closing</td><td class="num">${escHtml(eur(selectedDirectorStatement.previousTotal))}</td></tr>
            <tr><td>Variance vs previous period</td><td class="num">${escHtml(comparePct(selectedDirectorStatement.closingTotal, selectedDirectorStatement.previousTotal))}</td></tr>
            <tr class="total"><td>Closing total</td><td class="num">${escHtml(eur(selectedDirectorStatement.closingTotal))}</td></tr>
          `;
      const txTable =
        mode === "summary"
          ? ""
          : `
            <div class="section">
              <h3>Transaction Breakdown</h3>
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Amount</th></tr></thead>
                <tbody>
                  ${
                    selectedDirectorStatement.movementRows.length
                      ? selectedDirectorStatement.movementRows
                          .map(
                            (r) =>
                              `<tr><td>${escHtml(fmtDate(r.date))}</td><td>${escHtml(r.typeLabel)}</td><td>${escHtml(r.description || "—")}</td><td class="num">${escHtml(eur(r.amount))}</td></tr>`
                          )
                          .join("")
                      : `<tr><td colspan="4">No director transactions in selected period.</td></tr>`
                  }
                </tbody>
              </table>
            </div>`;
      const contributionRows = selectedDirectorStatement.movementRows.filter((r) => r.type === "CONTRIBUTION");
      const monthlyMap = new Map();
      for (const r of contributionRows) {
        const month = String(r.date).slice(0, 7);
        const cur = monthlyMap.get(month) || { amount: 0, count: 0 };
        cur.amount += r.amount;
        cur.count += 1;
        monthlyMap.set(month, cur);
      }
      const monthlyRows = [...monthlyMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, v]) => ({
          month,
          amount: v.amount,
          status: "Paid",
          note: `${v.count} contribution${v.count === 1 ? "" : "s"}`
        }));
      const totalPaid = monthlyRows.reduce((s, r) => s + r.amount, 0);
      const transactionsRecordedRows = selectedDirectorStatement.movementRows
        .map((r) => {
          const amount = Number(r.amount) || 0;
          const debit = amount < 0 ? Math.abs(amount) : 0;
          const credit = amount >= 0 ? amount : 0;
          return {
            date: fmtDate(r.date),
            ref: `TX-${r.id}`,
            description: r.description || r.typeLabel,
            debit,
            credit
          };
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const monthlySection = `
        <div class="section">
          <h3>Monthly Contributions (${monthlyRows.length} paid · Total: ${escHtml(eur(totalPaid))})</h3>
          <table>
            <thead><tr><th>Month</th><th class="num">Amount</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              ${
                monthlyRows.length
                  ? monthlyRows
                      .map(
                        (r) =>
                          `<tr><td>${escHtml(r.month)}</td><td class="num">${escHtml(eur(r.amount))}</td><td>${escHtml(r.status)}</td><td>${escHtml(r.note)}</td></tr>`
                      )
                      .join("")
                  : `<tr><td colspan="4">No contributions recorded in selected period.</td></tr>`
              }
              <tr class="total"><td colspan="3">Total Paid</td><td class="num">${escHtml(eur(totalPaid))}</td></tr>
            </tbody>
          </table>
        </div>`;
      const transactionsRecordedSection = `
        <div class="section">
          <h3>Transactions Recorded (${transactionsRecordedRows.length})</h3>
          <table>
            <thead><tr><th>Date</th><th>Ref</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
            <tbody>
              ${
                transactionsRecordedRows.length
                  ? transactionsRecordedRows
                      .map(
                        (r) =>
                          `<tr><td>${escHtml(r.date)}</td><td>${escHtml(r.ref)}</td><td>${escHtml(r.description)}</td><td class="num">${r.debit ? escHtml(eur(r.debit)) : "—"}</td><td class="num">${r.credit ? escHtml(eur(r.credit)) : "—"}</td></tr>`
                      )
                      .join("")
                  : `<tr><td colspan="5">No transactions recorded in selected period.</td></tr>`
              }
            </tbody>
          </table>
        </div>`;
      openPrintDocument(
        `Director Statement (${mode})`,
        "Director Statement",
        `${reportMeta} · Status: FINAL`,
        statementRef,
        `<div class="section">
          <h3>Director Identity</h3>
          <table><tbody>
            <tr><td>Name</td><td>${escHtml(selectedDirectorStatement.name)}</td><td>Role</td><td>${escHtml(selectedDirectorStatement.role)}</td></tr>
            <tr><td>Email</td><td>${escHtml(selectedDirectorStatement.email)}</td><td>Phone</td><td>${escHtml(selectedDirectorStatement.phone)}</td></tr>
            <tr><td>Address</td><td>${escHtml(selectedDirectorStatement.address)}</td><td>Joined round</td><td>${escHtml(selectedDirectorStatement.joinedRound ?? "—")}</td></tr>
            <tr><td>Equity share</td><td>${escHtml(`${selectedDirectorStatement.equitySharePct.toFixed(2)}%`)}</td><td></td><td></td></tr>
          </tbody></table>
        </div>
        <div class="section"><h3>Capital Movement</h3><table><thead><tr><th>Line Item</th><th class="num">Amount</th></tr></thead><tbody>${rowsSingle}</tbody></table></div>
        ${monthlySection}
        ${transactionsRecordedSection}
        ${txTable}`
      );
      await logReportEvent("PRINT", "DIRECTOR_STATEMENT", mode);
      return;
    }
    const rows =
      mode === "summary"
        ? `
          <tr><td>Total capital</td><td class="num">${escHtml(eur(directorCapital.totalCapital))}</td></tr>
          <tr><td>Total side fund</td><td class="num">${escHtml(eur(directorCapital.totalSideFund))}</td></tr>
          <tr class="total"><td>Total stake</td><td class="num">${escHtml(eur(directorCapital.totalStake))}</td></tr>
        `
        : `
          ${directorCapital.rows
            .map(
              (r) =>
                `<tr><td>${escHtml(r.name || "Unknown")}</td><td>${escHtml(r.email || "Not provided")}</td><td class="num">${escHtml(eur(r.capital))}</td><td class="num">${escHtml(eur(r.sideFund))}</td><td class="num">${escHtml(eur(r.total))}</td><td class="num">${escHtml(`${Number(r.equitySharePct || 0).toFixed(2)}%`)}</td></tr>`
            )
            .join("")}
          <tr class="total"><td colspan="2">TOTAL</td><td class="num">${escHtml(eur(directorCapital.totalCapital))}</td><td class="num">${escHtml(eur(directorCapital.totalSideFund))}</td><td class="num">${escHtml(eur(directorCapital.totalStake))}</td><td class="num">100.00%</td></tr>
        `;
    openPrintDocument(
      `Director Capital (${mode})`,
      "Director Capital Statement",
      reportMeta,
      statementRef,
      `<div class="section"><h3>Director Capital Register</h3><table><thead><tr><th>Director</th><th>Email</th><th class="num">Capital</th><th class="num">Side fund</th><th class="num">Total stake</th><th class="num">Equity %</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
    await logReportEvent("PRINT", "DIRECTOR_CAPITAL", mode);
  }

  return (
    <div className="ui-animate-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold ui-page-heading">Reports</div>
          <div className="text-sm ui-body-text">
            Time-based views of income, expenses, and contributions from the ledger. Filter by date or export
            CSV.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" className="ui-btn-outline" onClick={() => window.print()}>
            Print report
          </button>
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200 dark:hover:bg-brand-900/60"
            onClick={async () => {
              if (!txs.length) return window.alert("No transactions in the selected range to export.");
              downloadTransactionsCsv(txs, "zweck-transactions-export.csv");
              await logReportEvent("EXPORT_CSV", "TRANSACTIONS", "detailed");
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      <PrintStatementHeader
        title="Financial report"
        subtitle={`Income, expenses & contributions — ${rangeLabel}`}
        meta={`Generated ${new Date().toLocaleString()} · ZweckOS`}
      />

      <div className="ui-animate-pop ui-surface rounded-xl p-4 print:hidden">
        <div className="text-sm font-semibold ui-page-heading">Date range</div>
        <p className="text-xs ui-page-muted">Leave blank to include all posted transactions.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="rep-from">
              From
            </label>
            <input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ui-input mt-1" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="rep-to">
              To
            </label>
            <input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ui-input mt-1" />
          </div>
          <button type="button" className="ui-btn-outline text-slate-700" onClick={clearRange}>
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Contributions (period)" value={eur(kpis.contributions)} />
        <MetricCard label="Income (period)" value={eur(kpis.income)} sub="Project returns, penalties, loan" />
        <MetricCard label="Expenses (period)" value={eur(kpis.expenses)} sub="Reg, charges, legal, other" />
        <MetricCard
          label="Net (income − expenses)"
          value={eur(kpis.net)}
          sub={kpis.net >= 0 ? "Surplus" : "Deficit"}
        />
      </div>

      <section className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Profit and Loss Statement</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => printProfitLoss("summary")}>
              Print summary
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => printProfitLoss("detailed")}>
              Print detailed
            </button>
            <button
              type="button"
              className="ui-btn-outline-xs"
              onClick={async () => {
                if (!txs.length) return window.alert("No transactions in the selected range to export.");
                downloadSimpleCsv(
                  "profit-loss-statement.csv",
                  ["Section", "Line item", "Amount"],
                  [
                    ...profitLoss.income.map((r) => ["Income", r.label, r.amount]),
                    ...profitLoss.expenses.map((r) => ["Expenses", r.label, r.amount]),
                    ["Totals", "Total income", profitLoss.totalIncome],
                    ["Totals", "Total expenses", profitLoss.totalExpenses],
                    ["Totals", "Net profit/loss", profitLoss.net]
                  ]
                );
                await logReportEvent("EXPORT_CSV", "PROFIT_LOSS", "detailed");
              }}
            >
              Export P&L CSV
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Income</div>
            <div className="space-y-1 text-sm">
              {profitLoss.income.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span>{r.label}</span>
                  <span className="font-medium">{eur(r.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold dark:border-slate-700">
                <span>Total income</span>
                <span>{eur(profitLoss.totalIncome)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Expenses</div>
            <div className="space-y-1 text-sm">
              {profitLoss.expenses.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span>{r.label}</span>
                  <span className="font-medium">{eur(r.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 font-semibold dark:border-slate-700">
                <span>Total expenses</span>
                <span>{eur(profitLoss.totalExpenses)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/60">
          <div className="flex items-center justify-between font-semibold">
            <span>Net profit / (loss)</span>
            <span className={profitLoss.net >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
              {eur(profitLoss.net)}
            </span>
          </div>
        </div>
      </section>

      <section className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Balance Sheet</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => printBalanceSheet("summary")}>
              Print summary
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => printBalanceSheet("detailed")}>
              Print detailed
            </button>
            <button
              type="button"
              className="ui-btn-outline-xs"
              onClick={async () => {
                downloadSimpleCsv(
                  "balance-sheet.csv",
                  ["Section", "Amount"],
                  [
                    ["Assets", qSummary.data?.assets ?? 0],
                    ["Liabilities", qSummary.data?.liabilities ?? 0],
                    ["Equity", qSummary.data?.equity ?? 0],
                    ["Assets = Liabilities + Equity (check)", (qSummary.data?.assets ?? 0) - ((qSummary.data?.liabilities ?? 0) + (qSummary.data?.equity ?? 0))]
                  ]
                );
                await logReportEvent("EXPORT_CSV", "BALANCE_SHEET", "detailed");
              }}
            >
              Export Balance Sheet CSV
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard label="Assets" value={eur(qSummary.data?.assets ?? 0)} />
          <MetricCard label="Liabilities" value={eur(qSummary.data?.liabilities ?? 0)} />
          <MetricCard label="Equity" value={eur(qSummary.data?.equity ?? 0)} />
        </div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/60">
          <div className="flex items-center justify-between font-medium">
            <span>Balancing check: Assets - (Liabilities + Equity)</span>
            <span>{eur((qSummary.data?.assets ?? 0) - ((qSummary.data?.liabilities ?? 0) + (qSummary.data?.equity ?? 0)) )}</span>
          </div>
        </div>
      </section>

      <section className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Cash Flow Statement</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => printCashFlow("summary")}>
              Print summary
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => printCashFlow("detailed")}>
              Print detailed
            </button>
            <button
              type="button"
              className="ui-btn-outline-xs"
              onClick={async () => {
                if (!txs.length) return window.alert("No transactions in the selected range to export.");
                downloadSimpleCsv(
                  "cash-flow-statement.csv",
                  ["Line", "Amount"],
                  [
                    ["Operating inflows", cashFlow.operatingIn],
                    ["Operating outflows", cashFlow.operatingOut],
                    ["Net cash from operating", cashFlow.netOperating],
                    ["Investing outflows", cashFlow.investingOut],
                    ["Net cash from investing", cashFlow.netInvesting],
                    ["Financing inflows", cashFlow.financingIn],
                    ["Net cash from financing", cashFlow.netFinancing],
                    ["Net change in cash", cashFlow.netChange]
                  ]
                );
                await logReportEvent("EXPORT_CSV", "CASH_FLOW", "detailed");
              }}
            >
              Export Cash Flow CSV
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricCard label="Net operating" value={eur(cashFlow.netOperating)} />
          <MetricCard label="Net investing" value={eur(cashFlow.netInvesting)} />
          <MetricCard label="Net financing" value={eur(cashFlow.netFinancing)} />
          <MetricCard label="Net cash change" value={eur(cashFlow.netChange)} />
        </div>
      </section>

      <section className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Director Capital Statement</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="director-statement-select">
              Statement scope
            </label>
            <select
              id="director-statement-select"
              className="ui-input py-1 text-xs"
              value={selectedDirectorId}
              onChange={(e) => setSelectedDirectorId(e.target.value)}
            >
              <option value="ALL">All directors (register)</option>
              {(qDirectors.data || []).map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => printDirectorCapital("summary")}>
              Print summary
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => printDirectorCapital("detailed")}>
              Print detailed
            </button>
            <button
              type="button"
              className="ui-btn-outline-xs"
              onClick={async () => {
                if (!directorCapital.rows.length) return window.alert("No director capital data to export.");
                if (selectedDirectorId !== "ALL") {
                  if (!selectedDirectorStatement) return window.alert("Selected director not found.");
                  downloadSimpleCsv(
                    `director-statement-${selectedDirectorStatement.id}.csv`,
                    ["Director", "Email", "Phone", "Address", "Opening", "Movement", "Closing", "Prev Period", "Variance %", "Equity %"],
                    [
                      [
                        selectedDirectorStatement.name,
                        selectedDirectorStatement.email,
                        selectedDirectorStatement.phone,
                        selectedDirectorStatement.address,
                        selectedDirectorStatement.openingTotal,
                        selectedDirectorStatement.movementTotal,
                        selectedDirectorStatement.closingTotal,
                        selectedDirectorStatement.previousTotal,
                        comparePct(selectedDirectorStatement.closingTotal, selectedDirectorStatement.previousTotal),
                        `${selectedDirectorStatement.equitySharePct.toFixed(2)}%`
                      ]
                    ]
                  );
                  await logReportEvent("EXPORT_CSV", "DIRECTOR_STATEMENT", "detailed");
                  return;
                }
                downloadSimpleCsv(
                  "director-capital-statement.csv",
                  ["Director", "Email", "Capital", "Side fund", "Total stake", "Equity %"],
                  [
                    ...directorCapital.rows.map((r) => [r.name, r.email, r.capital, r.sideFund, r.total, `${Number(r.equitySharePct || 0).toFixed(2)}%`]),
                    ["TOTAL", "", directorCapital.totalCapital, directorCapital.totalSideFund, directorCapital.totalStake, "100.00%"]
                  ]
                );
                await logReportEvent("EXPORT_CSV", "DIRECTOR_CAPITAL", "detailed");
              }}
            >
              Export Director Capital CSV
            </button>
          </div>
        </div>
        {selectedDirectorStatement ? (
          <div className="mt-3 rounded-xl border border-brand-200/60 bg-brand-50/40 p-3 text-xs text-slate-700 dark:border-brand-500/40 dark:bg-brand-950/30 dark:text-slate-300">
            Single-director statement enabled for <span className="font-semibold">{selectedDirectorStatement.name}</span>.
            Print validates identity fields (email, phone, address) before generating.
          </div>
        ) : null}
        {selectedDirectorStatement ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <MetricCard label="Opening balance" value={eur(selectedDirectorStatement.openingTotal)} />
              <MetricCard label="Movement in period" value={eur(selectedDirectorStatement.movementTotal)} />
              <MetricCard label="Closing balance" value={eur(selectedDirectorStatement.closingTotal)} />
              <MetricCard
                label="Variance vs previous"
                value={comparePct(selectedDirectorStatement.closingTotal, selectedDirectorStatement.previousTotal)}
              />
            </div>
            <div className="ui-table-wrap">
              <table className="min-w-full text-left text-sm">
                <thead className="ui-table-head">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="ui-table-divide">
                  {selectedDirectorStatement.movementRows.map((r) => (
                    <tr key={r.id} className="ui-table-row-hover">
                      <td className="px-3 py-2">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2">{r.typeLabel}</td>
                      <td className="px-3 py-2">{r.description || "—"}</td>
                      <td className="px-3 py-2 text-right">{eur(r.amount)}</td>
                    </tr>
                  ))}
                  {!selectedDirectorStatement.movementRows.length ? (
                    <tr>
                      <td className="px-3 py-3 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                        No director transactions in selected period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="ui-table-wrap mt-3">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Director</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2 text-right">Capital</th>
                  <th className="px-3 py-2 text-right">Side fund</th>
                  <th className="px-3 py-2 text-right">Total stake</th>
                  <th className="px-3 py-2 text-right">Equity %</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {directorCapital.rows.map((r) => (
                  <tr key={`${r.email}-${r.name}`}>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2 text-right">{eur(r.capital)}</td>
                    <td className="px-3 py-2 text-right">{eur(r.sideFund)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{eur(r.total)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{Number(r.equitySharePct || 0).toFixed(2)}%</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold dark:bg-slate-900/60">
                  <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                  <td className="px-3 py-2 text-right">{eur(directorCapital.totalCapital)}</td>
                  <td className="px-3 py-2 text-right">{eur(directorCapital.totalSideFund)}</td>
                  <td className="px-3 py-2 text-right">{eur(directorCapital.totalStake)}</td>
                  <td className="px-3 py-2 text-right">100.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ui-surface rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Monthly income vs expenses vs contributions</div>
          <div className="mt-2 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => eurCompact(v)} />
                <RechartsTooltip formatter={(value) => eur(value)} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Income" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="contributions"
                  name="Contributions"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ui-surface rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Totals by transaction type</div>
          <div className="mt-2 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={byType.slice(0, 14)}
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                <XAxis type="number" tickFormatter={(v) => eurCompact(v)} />
                <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10 }} />
                <RechartsTooltip formatter={(v) => eur(v)} />
                <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ui-surface rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Income mix</div>
          <p className="text-xs ui-page-muted">Project returns, penalties, loan repayments.</p>
          <div className="mt-2 h-64">
            {mix.incomeRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mix.incomeRows} dataKey="value" nameKey="name" outerRadius={88} labelLine={false}>
                    {mix.incomeRows.map((_, i) => (
                      <Cell key={_.type} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v) => eur(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm ui-page-muted">No income rows.</div>
            )}
          </div>
        </div>
        <div className="ui-surface rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Expense mix</div>
          <p className="text-xs ui-page-muted">Registration, transaction charges, legal, other out.</p>
          <div className="mt-2 h-64">
            {mix.expenseRows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mix.expenseRows} dataKey="value" nameKey="name" outerRadius={88} labelLine={false}>
                    {mix.expenseRows.map((_, i) => (
                      <Cell key={_.type} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v) => eur(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm ui-page-muted">No expense rows.</div>
            )}
          </div>
        </div>
      </div>

      <div className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="mb-2 text-sm font-semibold ui-page-heading">Monthly summary</div>
        <div className="ui-table-wrap">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Contributions</th>
                <th className="px-3 py-2 text-right">Income</th>
                <th className="px-3 py-2 text-right">Expenses</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {monthlyTable.map((row) => (
                <tr key={row.month}>
                  <td className="px-3 py-2 font-mono text-xs">{row.month}</td>
                  <td className="px-3 py-2 text-right">{eur(row.contributions)}</td>
                  <td className="px-3 py-2 text-right">{eur(row.income)}</td>
                  <td className="px-3 py-2 text-right">{eur(row.expenses)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{eur(row.net)}</td>
                </tr>
              ))}
              {!monthlyTable.length && (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                    No data in range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ui-animate-pop ui-surface rounded-2xl p-4">
        <div className="mb-2 text-sm font-semibold ui-page-heading">Most recent 10 transactions (in range)</div>
        <div className="ui-table-wrap">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Director</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide text-slate-800 dark:text-slate-200">
              {top10.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">
                    {TX_TYPE_LABELS[t.type] || t.type.replaceAll("_", " ")}
                  </td>
                  <td className="px-3 py-2">
                    {t.director?.name || <span className="text-slate-400 dark:text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">{eur(t.amount)}</td>
                </tr>
              ))}
              {!top10.length && (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                    No transactions in range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
