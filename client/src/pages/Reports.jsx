import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import MetricCard from "../components/MetricCard";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { listTransactions } from "../api/transactions";
import { eur, eurCompact, fmtDate } from "../lib/format";
import { TX_TYPE_LABELS } from "../lib/dashboardAnalytics";
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

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";

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

  if (qTx.isLoading) return <Loading label="Loading reports..." />;
  if (qTx.error) return <ErrorBanner error={qTx.error} />;

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
