import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { useSummary } from "../hooks/useDashboard";
import { eur } from "../lib/format";

const GROUPS = ["Assets", "Equity", "Income", "Expenses"];

export default function ChartOfAccounts() {
  const q = useSummary();
  if (q.isLoading) return <Loading label="Loading accounts..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const { accounts, balances } = q.data;

  function groupRows(group) {
    return Object.entries(accounts)
      .filter(([, v]) => v.group === group)
      .map(([key, meta]) => ({ key, meta, bal: balances[key] || 0 }));
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Chart of Accounts</div>
        <div className="text-sm text-slate-600">Balances are derived from transactions on each visit.</div>
      </div>

      {GROUPS.map((g) => {
        const rows = groupRows(g);
        const subtotal = rows.reduce((s, r) => s + r.bal, 0);
        const displaySubtotal = g === "Income" || g === "Equity" ? -subtotal : subtotal;
        return (
          <div key={g} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">{g}</div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3">Key</th>
                    <th className="py-2 pr-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const display = g === "Income" || g === "Equity" ? -r.bal : r.bal;
                    const zero = Math.abs(display) < 0.0000001;
                    return (
                      <tr key={r.key} className={zero ? "text-slate-400" : ""}>
                        <td className="py-2 pr-3 font-medium">{r.meta.name}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{r.key}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{eur(display)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50">
                    <td className="py-2 pr-3 font-semibold" colSpan={2}>
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
    </div>
  );
}

