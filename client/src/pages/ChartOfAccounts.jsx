import { useMemo } from "react";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import MetricCard from "../components/MetricCard";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { useSummary } from "../hooks/useDashboard";
import { eur, eurCompact } from "../lib/format";
import { downloadChartOfAccountsCsv } from "../lib/reportsAnalytics";
import { useDarkClass } from "../lib/useDarkClass";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const GROUPS = ["Assets", "Equity", "Income", "Expenses"];
const GROUP_BAR_COLORS = {
  Assets: "#0ea5e9",
  Equity: "#a855f7",
  Income: "#22c55e",
  Expenses: "#ef4444"
};
const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#64748b"];

export default function ChartOfAccounts() {
  const q = useSummary();
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";

  const accounts = q.data?.accounts;
  const balances = q.data?.balances;
  const assetsTotal = q.data?.assets;
  const equityTotal = q.data?.equity;
  const incomeTotal = q.data?.income;
  const expensesTotal = q.data?.expenses;
  const netTotal = q.data?.net;

  const assetPieData = useMemo(() => {
    if (!accounts || !balances) return [];
    const rows = [];
    for (const [key, meta] of Object.entries(accounts)) {
      if (meta.group !== "Assets") continue;
      const bal = balances[key] || 0;
      const display = bal;
      if (Math.abs(display) < 1e-9) continue;
      rows.push({ name: meta.name, key, value: Math.abs(display) });
    }
    return rows;
  }, [accounts, balances]);

  const assetsSumAbs = useMemo(() => {
    return assetPieData.reduce((s, r) => s + r.value, 0);
  }, [assetPieData]);

  const barData = useMemo(() => {
    if (!accounts || !balances) return [];
    const out = [];
    for (const g of GROUPS) {
      for (const [key, meta] of Object.entries(accounts)) {
        if (meta.group !== g) continue;
        const bal = balances[key] || 0;
        const display = g === "Income" || g === "Equity" ? -bal : bal;
        out.push({
          key: `${g}-${key}`,
          short: meta.name.length > 22 ? `${meta.name.slice(0, 20)}…` : meta.name,
          name: meta.name,
          group: g,
          display
        });
      }
    }
    return out.sort((a, b) => Math.abs(b.display) - Math.abs(a.display)).slice(0, 18);
  }, [accounts, balances]);

  if (q.isLoading) return <Loading label="Loading accounts..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  function groupRows(group) {
    return Object.entries(accounts)
      .filter(([, v]) => v.group === group)
      .map(([key, meta]) => ({ key, meta, bal: balances[key] || 0 }));
  }

  function pctOfAssets(displayBalance, group) {
    if (group !== "Assets" || assetsSumAbs < 1e-9) return null;
    return (Math.abs(displayBalance) / assetsSumAbs) * 100;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold ui-page-heading">Chart of Accounts</div>
          <div className="text-sm ui-body-text">
            Balances are derived from posted transactions. Use charts for composition; export CSV for spreadsheets.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" className="ui-btn-outline" onClick={() => window.print()}>
            Print
          </button>
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200 dark:hover:bg-brand-900/60"
            onClick={() => downloadChartOfAccountsCsv(accounts, balances, GROUPS)}
          >
            Export CSV
          </button>
        </div>
      </div>

      <PrintStatementHeader
        title="Chart of accounts"
        subtitle="Account balances (derived)"
        meta={`Generated ${new Date().toLocaleString()} · ZweckOS`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total assets" value={eur(assetsTotal ?? 0)} />
        <MetricCard label="Equity (display)" value={eur(equityTotal ?? 0)} />
        <MetricCard label="Income (cumulative)" value={eur(incomeTotal ?? 0)} />
        <MetricCard label="Expenses (cumulative)" value={eur(expensesTotal ?? 0)} />
        <MetricCard label="Net (income − expenses)" value={eur(netTotal ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ui-surface rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Largest balances (by absolute amount)</div>
          <p className="text-xs ui-page-muted">Top accounts across all groups.</p>
          <div className="mt-3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={barData} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                <XAxis type="number" tickFormatter={(v) => eurCompact(v)} />
                <YAxis type="category" dataKey="short" width={120} tick={{ fontSize: 10 }} />
                <RechartsTooltip
                  formatter={(v) => eur(v)}
                  labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                />
                <Bar dataKey="display" radius={[0, 4, 4, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.key} fill={GROUP_BAR_COLORS[entry.group] || "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ui-surface rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Asset composition</div>
          <p className="text-xs ui-page-muted">Share of total asset accounts (absolute balances).</p>
          <div className="mt-3 h-80">
            {assetPieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={assetPieData} dataKey="value" nameKey="name" outerRadius={100} labelLine={false}>
                    {assetPieData.map((_, i) => (
                      <Cell key={_.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v) => eur(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm ui-page-muted">No asset balances.</div>
            )}
          </div>
        </div>
      </div>

      {GROUPS.map((g) => {
        const rows = groupRows(g);
        const subtotal = rows.reduce((s, r) => s + r.bal, 0);
        const displaySubtotal = g === "Income" || g === "Equity" ? -subtotal : subtotal;
        return (
          <div key={g} className="ui-surface rounded-xl p-4">
            <div className="text-sm font-semibold ui-page-heading">{g}</div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3">Key</th>
                    {g === "Assets" ? <th className="py-2 pr-3 text-right">% of assets</th> : null}
                    <th className="py-2 pr-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-600/80">
                  {rows.map((r) => {
                    const display = g === "Income" || g === "Equity" ? -r.bal : r.bal;
                    const zero = Math.abs(display) < 0.0000001;
                    const pct = pctOfAssets(display, g);
                    return (
                      <tr key={r.key} className={zero ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}>
                        <td className="py-2 pr-3 font-medium">{r.meta.name}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{r.key}</td>
                        {g === "Assets" ? (
                          <td className="py-2 pr-3 text-right text-xs text-slate-600 dark:text-slate-400">
                            {pct != null && !zero ? `${pct.toFixed(1)}%` : "—"}
                          </td>
                        ) : null}
                        <td className="py-2 pr-3 text-right font-semibold">{eur(display)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 dark:bg-slate-900/60">
                    <td className="py-2 pr-3 font-semibold" colSpan={g === "Assets" ? 3 : 2}>
                      Subtotal
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{eur(displaySubtotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="ui-stat-strip rounded-lg p-4 text-sm text-slate-700 dark:text-slate-300">
        <strong className="text-slate-900 dark:text-slate-100">Note:</strong> Income and equity balances are shown with flipped sign for
        readability (same convention as elsewhere in ZweckOS). Export includes raw display values per row.
      </div>
    </div>
  );
}
