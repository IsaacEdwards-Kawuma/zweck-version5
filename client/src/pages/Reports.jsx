import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { useSummary } from "../hooks/useDashboard";
import { listTransactions } from "../api/transactions";
import { eur, fmtDate } from "../lib/format";
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
  Bar
} from "recharts";

export default function Reports() {
  const qSummary = useSummary();
  const qTx = useQuery({
    queryKey: ["transactions", "reports"],
    queryFn: () => listTransactions()
  });

  if (qSummary.isLoading || qTx.isLoading) return <Loading label="Loading reports..." />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qTx.error) return <ErrorBanner error={qTx.error} />;

  const txs = qTx.data || [];

  const mapMonth = new Map();
  for (const t of txs) {
    const d = new Date(t.date);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let row = mapMonth.get(ym);
    if (!row) {
      row = { month: ym, income: 0, expenses: 0, contributions: 0 };
      mapMonth.set(ym, row);
    }
    if (t.type === "CONTRIBUTION") row.contributions += t.amount;
    if (t.type === "MMF_RETURN" || t.type === "PENALTY" || t.type === "LOAN_IN") {
      row.income += t.amount;
    }
    if (
      t.type === "REGISTRATION" ||
      t.type === "TX_CHARGE" ||
      t.type === "LEGAL" ||
      t.type === "OTHER_OUT"
    ) {
      row.expenses += t.amount;
    }
  }
  const byMonth = Array.from(mapMonth.values()).sort((a, b) =>
    a.month > b.month ? 1 : -1
  );

  const mapType = new Map();
  for (const t of txs) {
    mapType.set(t.type, (mapType.get(t.type) || 0) + t.amount);
  }
  const byType = Array.from(mapType.entries()).map(([type, total]) => ({
    type,
    total
  }));

  const top10 = txs.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold text-slate-900">Reports</div>
        <div className="text-sm text-slate-600">
          Time-based views of income, expenses, and contributions derived from the transaction ledger.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">
            Monthly income vs expenses vs contributions
          </div>
          <div className="mt-2 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip
                  formatter={(value) => eur(value)}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke="#22c55e"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="contributions"
                  name="Contributions"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Totals by transaction type</div>
          <div className="mt-2 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byType}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip formatter={(value) => eur(value)} />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">
          Most recent 10 transactions
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Director</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {top10.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">
                    {t.type.replaceAll("_", " ")}
                  </td>
                  <td className="px-3 py-2">
                    {t.director?.name || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">
                    {eur(t.amount)}
                  </td>
                </tr>
              ))}
              {!top10.length && (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>
                    No transactions yet.
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

