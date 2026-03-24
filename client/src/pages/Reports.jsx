import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import MetricCard from "../components/MetricCard";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { listTransactions } from "../api/transactions";
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

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";

  const qSummary = useSummary();
  const qDirectors = useDirectorsAll();
  const qTx = useQuery({
    queryKey: ["transactions", "reports"],
    queryFn: () => listTransactions()
  });

  const rawTxs = useMemo(() => qTx.data ?? [], [qTx.data]);
  const txs = useMemo(() => filterByDateRange(rawTxs, from, to), [rawTxs, from, to]);
  const byMonth = useMemo(() => aggregateReportByMonth(txs), [txs]);
  const byType = useMemo(() => aggregateByTypeTotals(txs), [txs]);
  const kpis = useMemo(() => reportPeriodKpis(txs), [txs]);
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

  if (qTx.isLoading || qSummary.isLoading || qDirectors.isLoading) return <Loading label="Loading reports..." />;
  if (qTx.error) return <ErrorBanner error={qTx.error} />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qDirectors.error) return <ErrorBanner error={qDirectors.error} />;

  function clearRange() {
    setFrom("");
    setTo("");
  }

  const rangeLabel =
    from || to
      ? `${from || "…"} → ${to || "…"}`
      : "All dates";

  return (
    <div className="space-y-6">
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
            onClick={() => downloadTransactionsCsv(txs, "zweck-transactions-export.csv")}
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

      <div className="ui-surface rounded-xl p-4 print:hidden">
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

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Profit and Loss Statement</div>
          <button
            type="button"
            className="ui-btn-outline-xs"
            onClick={() =>
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
              )
            }
          >
            Export P&L CSV
          </button>
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

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Balance Sheet</div>
          <button
            type="button"
            className="ui-btn-outline-xs"
            onClick={() =>
              downloadSimpleCsv(
                "balance-sheet.csv",
                ["Section", "Amount"],
                [
                  ["Assets", qSummary.data?.assets ?? 0],
                  ["Liabilities", qSummary.data?.liabilities ?? 0],
                  ["Equity", qSummary.data?.equity ?? 0],
                  ["Assets = Liabilities + Equity (check)", (qSummary.data?.assets ?? 0) - ((qSummary.data?.liabilities ?? 0) + (qSummary.data?.equity ?? 0))]
                ]
              )
            }
          >
            Export Balance Sheet CSV
          </button>
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

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Cash Flow Statement</div>
          <button
            type="button"
            className="ui-btn-outline-xs"
            onClick={() =>
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
              )
            }
          >
            Export Cash Flow CSV
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricCard label="Net operating" value={eur(cashFlow.netOperating)} />
          <MetricCard label="Net investing" value={eur(cashFlow.netInvesting)} />
          <MetricCard label="Net financing" value={eur(cashFlow.netFinancing)} />
          <MetricCard label="Net cash change" value={eur(cashFlow.netChange)} />
        </div>
      </section>

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Director Capital Statement</div>
          <button
            type="button"
            className="ui-btn-outline-xs"
            onClick={() =>
              downloadSimpleCsv(
                "director-capital-statement.csv",
                ["Director", "Email", "Capital", "Side fund", "Total stake"],
                [
                  ...directorCapital.rows.map((r) => [r.name, r.email, r.capital, r.sideFund, r.total]),
                  ["TOTAL", "", directorCapital.totalCapital, directorCapital.totalSideFund, directorCapital.totalStake]
                ]
              )
            }
          >
            Export Director Capital CSV
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Director</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2 text-right">Capital</th>
                <th className="px-3 py-2 text-right">Side fund</th>
                <th className="px-3 py-2 text-right">Total stake</th>
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
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold dark:bg-slate-900/60">
                <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                <td className="px-3 py-2 text-right">{eur(directorCapital.totalCapital)}</td>
                <td className="px-3 py-2 text-right">{eur(directorCapital.totalSideFund)}</td>
                <td className="px-3 py-2 text-right">{eur(directorCapital.totalStake)}</td>
              </tr>
            </tbody>
          </table>
        </div>
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

      <div className="ui-surface rounded-2xl p-4">
        <div className="mb-2 text-sm font-semibold ui-page-heading">Monthly summary</div>
        <div className="overflow-x-auto">
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
            <tbody className="divide-y divide-slate-100">
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

      <div className="ui-surface rounded-2xl p-4">
        <div className="mb-2 text-sm font-semibold ui-page-heading">Most recent 10 transactions (in range)</div>
        <div className="overflow-x-auto">
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
