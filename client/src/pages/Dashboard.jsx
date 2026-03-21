import MetricCard from "../components/MetricCard";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import TransactionTable from "../components/TransactionTable";
import { eur, pct01 } from "../lib/format";
import {
  useBalances,
  useDirectorsAll,
  usePortfolio,
  useRecentTransactions,
  useSummary,
  useTransactionsCount
} from "../hooks/useDashboard";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

export default function Dashboard() {
  const qBalances = useBalances();
  const qSummary = useSummary();
  const qDirs = useDirectorsAll();
  const qPortfolio = usePortfolio();
  const qRecent = useRecentTransactions();
  const qCount = useTransactionsCount();

  if (qBalances.isLoading || qSummary.isLoading || qDirs.isLoading || qPortfolio.isLoading || qRecent.isLoading || qCount.isLoading)
    return <Loading label="Loading dashboard..." />;

  if (qBalances.error) return <ErrorBanner error={qBalances.error} />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qDirs.error) return <ErrorBanner error={qDirs.error} />;
  if (qPortfolio.error) return <ErrorBanner error={qPortfolio.error} />;
  if (qRecent.error) return <ErrorBanner error={qRecent.error} />;
  if (qCount.error) return <ErrorBanner error={qCount.error} />;

  const balances = qBalances.data;
  const summary = qSummary.data;
  const directors = qDirs.data || [];
  const portfolio = qPortfolio.data;
  const recent = qRecent.data || [];
  const count = qCount.data || 0;

  const bank = balances?.bank || 0;
  const totalDirectorCapital = (directors || []).reduce((s, d) => s + (d.total || 0), 0);
  const totalAssets = portfolio?.totalAssets || 0;

  const portfolioData = [
    { name: "Bank", key: "bank", value: portfolio?.assets?.bank || 0 },
    { name: "MMF", key: "mmf", value: portfolio?.assets?.mmf || 0 },
    { name: "YPA", key: "ypa", value: portfolio?.assets?.ypa || 0 }
  ].filter((d) => d.value !== 0 || totalAssets === 0);

  const incomeExpenseData = [
    { name: "Income", value: summary.income || 0 },
    { name: "Expenses", value: summary.expenses || 0 },
    { name: "Net", value: summary.net || 0 }
  ];

  const COLORS = ["#0ea5e9", "#22c55e", "#f97316"];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Overview</h2>
        <p className="text-sm text-slate-500">
          Live snapshot of Zweck Co. balances and recent activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Bank Balance" value={eur(bank)} />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Total Director Capital" value={eur(totalDirectorCapital)} />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Total Assets" value={eur(totalAssets)} sub="Bank · MMF · YPA" />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-0.5">
          <MetricCard label="Transaction Count" value={String(count)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 text-slate-100 shadow-md">
          <div className="text-sm font-semibold text-slate-900">Director Capital Accounts</div>
          <div className="mt-3 max-h-72 overflow-x-auto rounded-xl bg-white/95 p-3 text-slate-900 backdrop-blur">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Director</th>
                  <th className="py-2 pr-3 text-right">Capital</th>
                  <th className="py-2 pr-3 text-right">Side fund</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {directors.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-900">{d.name}</div>
                      <div className="text-xs text-slate-500">{d.email}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{eur(d.capital || 0)}</td>
                    <td className="py-2 pr-3 text-right">{eur(d.sideFund || 0)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{eur(d.total || 0)}</td>
                  </tr>
                ))}
                {directors.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-slate-500" colSpan={4}>
                      No directors yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Portfolio Split</div>
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
                  <RechartsTooltip
                    formatter={(value) => eur(value)}
                    contentStyle={{ fontSize: 12 }}
                  />
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
                    <span className="text-slate-400">
                      {totalAssets ? `(${pct01(p.value / totalAssets)})` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Income vs Expenses</div>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeExpenseData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(value) => eur(value)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {incomeExpenseData.map((entry, index) => (
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
        <div className="mb-2 text-sm font-semibold text-slate-900">Last 7 Transactions</div>
        <TransactionTable rows={recent} />
      </div>
    </div>
  );
}

