import { eur, fmtDate } from "../lib/format";

const typeLabel = (t) => t?.replaceAll("_", " ");

export default function TransactionTable({ rows, showDelete, onDelete, isDeleting, role }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Director</th>
            <th className="px-4 py-3">Debit</th>
            <th className="px-4 py-3">Credit</th>
            <th className="px-4 py-3 text-right">Amount</th>
            {showDelete ? <th className="px-4 py-3 text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {(rows || []).map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.date)}</td>
              <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{typeLabel(r.type)}</td>
              <td className="px-4 py-3 max-w-[380px] truncate text-slate-700">{r.description || <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{r.director?.name || <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{r.debitAccount}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">{r.creditAccount}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right font-semibold">{eur(r.amount)}</td>
              {showDelete ? (
                <td className="px-4 py-3 text-right">
                  {role === "ADMIN" ? (
                    <button
                      disabled={isDeleting}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      onClick={() => onDelete?.(r.id)}
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Admin only</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
          {(rows || []).length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={showDelete ? 8 : 7}>
                No transactions yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

