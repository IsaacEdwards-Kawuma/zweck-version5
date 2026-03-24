import { useMemo, useId } from "react";
import MetricCard from "../components/MetricCard";
import DirectorAvatar from "../components/DirectorAvatar";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import TransactionTable from "../components/TransactionTable";
import { eur, eurCompact, pct01 } from "../lib/format";
import {
  monthlyVolumeSeries,
  volumeByType,
  directorInflowTotals,
  periodComparison30d
} from "../lib/dashboardAnalytics";
import { useDarkClass } from "../lib/useDarkClass";
import {
  useBalances,
  useDirectorsAll,
  usePortfolio,
  useSummary,
  useTransactionsList
} from "../hooks/useDashboard";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  Tooltip as RechartsTooltip
} from "recharts";

function compareSub(prev, deltaPct, fmt = (x) => String(x)) {
  const sign = deltaPct > 0 ? "+" : "";
  return `Prior 30d: ${fmt(prev)} · ${sign}${deltaPct}% vs prior`;
}

export default function Dashboard() {
  const gradId = useId().replace(/:/g, "");
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";
  const qBalances = useBalances();
  const qSummary = useSummary();
  const qDirs = useDirectorsAll();
  const qPortfolio = usePortfolio();
  const qTx = useTransactionsList();

  const transactions = useMemo(() => qTx.data ?? [], [qTx.data]);
  const recent = useMemo(() => transactions.slice(0, 7), [transactions]);
  const count = transactions.length;
  const monthly = useMemo(() => monthlyVolumeSeries(transactions, 12), [transactions]);
  const byType = useMemo(() => volumeByType(transactions), [transactions]);
  const directorInflows = useMemo(() => directorInflowTotals(transactions).slice(0, 10), [transactions]);
  const comp = useMemo(() => periodComparison30d(transactions), [transactions]);

  if (qBalances.isLoading || qSummary.isLoading || qDirs.isLoading || qPortfolio.isLoading || qTx.isLoading)
    return <Loading label="Loading dashboard..." />;

  if (qBalances.error) return <ErrorBanner error={qBalances.error} />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qDirs.error) return <ErrorBanner error={qDirs.error} />;
  if (qPortfolio.error) return <ErrorBanner error={qPortfolio.error} />;
  if (qTx.error) return <ErrorBanner error={qTx.error} />;

  const balances = qBalances.data;
  const summary = qSummary.data;
  const directors = qDirs.data || [];
  const portfolio = qPortfolio.data;

  const bank = balances?.bank || 0;
  const totalDirectorCapital = (directors || []).reduce((s, d) => s + (d.total || 0), 0);
  const totalAssets = portfolio?.totalAssets || 0;

  const portfolioData = [
    { name: "Bank", key: "bank", value: portfolio?.assets?.bank || 0 }
  ].filter((d) => d.value !== 0 || totalAssets === 0);

  const incomeExpenseData = [
    { name: "Income", value: summary.income || 0 },
    { name: "Expenses", value: summary.expenses || 0 },
    { name: "Net", value: summary.net || 0 }
  ];

  const COLORS = ["#0ea5e9", "#22c55e", "#f97316"];
  const TYPE_BAR = "#0284c7";
  const DIR_BAR = "#16a34a";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold ui-page-heading">Overview</h2>
        <p className="text-sm ui-page-muted">Live snapshot of Zweck Co. balances, analytics, and recent activity.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Bank Balance" value={eur(bank)} />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Total Director Capital" value={eur(totalDirectorCapital)} />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Total Assets" value={eur(totalAssets)} sub="Bank and project-linked assets" />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Transaction Count" value={String(count)} />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900">Analytics</h3>
        <p className="text-sm text-slate-500">Rolling windows and breakdowns from posted transactions.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetricCard
            label="Transactions (last 30 days)"
            value={String(comp.last30.count)}
            sub={compareSub(comp.prev30.count, comp.countDeltaPct)}
          />
          <MetricCard
            label="Volume (last 30 days)"
            value={eur(comp.last30.volume)}
            sub={compareSub(comp.prev30.volume, comp.volumeDeltaPct, eur)}
          />
        </div>

        <div className="ui-surface mt-6 rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Monthly transaction volume</div>
          <p className="text-xs ui-page-muted">Sum of amounts per calendar month (last 12 months).</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => eurCompact(v)} width={56} />
                <RechartsTooltip
                  formatter={(value) => [eur(value), "Volume"]}
                  labelFormatter={(l) => {
                    const row = monthly.find((m) => m.label === l);
                    return row ? `${row.label} · ${row.count} tx` : l;
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  name="Volume"
                  stroke="#0284c7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#${gradId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="ui-surface rounded-2xl p-4">
            <div className="text-sm font-semibold ui-page-heading">Volume by transaction type</div>
            <p className="text-xs ui-page-muted">Total EUR per type (all time).</p>
            <div className="mt-2 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={byType.slice(0, 12)}
                  margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => eurCompact(v)} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(v) => eur(v)} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="amount" fill={TYPE_BAR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ui-surface rounded-2xl p-4">
            <div className="text-sm font-semibold ui-page-heading">Director capital inflows</div>
            <p className="text-xs ui-page-muted">Sum of contributions and side-fund postings per director.</p>
            <div className="mt-2 h-72">
              {directorInflows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directorInflows.slice(0, 8)} margin={{ left: 4, right: 8, bottom: 36, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                      height={48}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => eurCompact(v)} width={56} />
                    <RechartsTooltip formatter={(v) => eur(v)} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="amount" fill={DIR_BAR} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No contribution or side-fund transactions with a director yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="ui-surface lg:col-span-2 rounded-2xl p-4">
          <div className="text-sm font-semibold ui-page-heading">Director Capital Accounts</div>
          <div className="mt-3 max-h-72 overflow-x-auto rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-600 dark:bg-slate-900/50">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Director</th>
                  <th className="py-2 pr-3 text-right">Capital</th>
                  <th className="py-2 pr-3 text-right">Side fund</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                {directors.map((d) => (
                  <tr key={d.id} className="ui-table-row-hover">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <DirectorAvatar director={d} size="sm" />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{d.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{d.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-800 dark:text-slate-200">{eur(d.capital || 0)}</td>
                    <td className="py-2 pr-3 text-right text-slate-800 dark:text-slate-200">{eur(d.sideFund || 0)}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {eur(d.total || 0)}
                    </td>
                  </tr>
                ))}
                {directors.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-slate-500 dark:text-slate-400" colSpan={4}>
                      No directors yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-surface rounded-2xl p-4">
            <div className="text-sm font-semibold ui-page-heading">Portfolio Split</div>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    dataKey="value"
                    data={portfolioData}
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={3}
                  >
                    {portfolioData.map((entry, index) => (
                      <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => eur(value)} contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {portfolioData.map((p, i) => (
                <div key={p.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-slate-600">{p.name}</span>
                  </div>
                  <div className="font-medium text-slate-900">
                    {eur(p.value)}{" "}
                    <span className="text-slate-400 dark:text-slate-500">
                      {totalAssets ? `(${pct01(p.value / totalAssets)})` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ui-surface rounded-2xl p-4">
            <div className="text-sm font-semibold ui-page-heading">Income vs Expenses</div>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => eurCompact(v)} />
                  <RechartsTooltip formatter={(value) => eur(value)} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {incomeExpenseData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={
                          entry.name === "Income"
                            ? "#22c55e"
                            : entry.name === "Expenses"
                              ? "#ef4444"
                              : "#0ea5e9"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold ui-page-heading">Last 7 Transactions</div>
        <TransactionTable rows={recent} />
      </div>
    </div>
  );
}
