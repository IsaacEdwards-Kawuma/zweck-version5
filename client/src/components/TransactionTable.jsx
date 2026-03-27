import DirectorAvatar from "./DirectorAvatar";
import { fmtDate, formatMoney, formatTxRef } from "../lib/format";
import { TX_TYPE_LABELS } from "../lib/transactionTypes";

const typeLabel = (t) => TX_TYPE_LABELS[t] || t?.replaceAll("_", " ");

function refDisplay(r) {
  return r.referenceNumber || r.reference || formatTxRef(r.id);
}

function postingLabel(s) {
  if (s === "REVERSED") return "Reversed";
  if (s === "PENDING") return "Pending";
  if (s === "POSTED" || s == null) return "Posted";
  return String(s);
}

export default function TransactionTable({ rows, showDelete, onDelete, isDeleting, role }) {
  const colCount = (showDelete ? 1 : 0) + 12;

  return (
    <div className="ui-table-wrap">
      <table className="min-w-full text-left text-sm">
        <thead className="ui-table-head">
          <tr>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Document</th>
            <th className="px-4 py-3">Director</th>
            <th className="px-4 py-3">Debit</th>
            <th className="px-4 py-3">Credit</th>
            <th className="px-4 py-3">Ccy</th>
            <th className="px-4 py-3 text-right">Amount</th>
            {showDelete ? <th className="px-4 py-3 text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="ui-table-divide">
          {(rows || []).map((r) => (
            <tr key={r.id} className="ui-table-row-hover">
              <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-400">
                {refDisplay(r)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                {postingLabel(r.postingStatus)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">{fmtDate(r.date)}</td>
              <td
                className="max-w-[14rem] truncate px-4 py-3 font-medium text-slate-900 dark:text-slate-100"
                title={typeLabel(r.type)}
              >
                {typeLabel(r.type)}
              </td>
              <td className="max-w-[380px] truncate px-4 py-3 text-slate-700 dark:text-slate-300">
                {r.description || <span className="text-slate-400 dark:text-slate-500">—</span>}
              </td>
              <td className="max-w-[12rem] truncate px-4 py-3 text-xs text-slate-700 dark:text-slate-300" title={r.project ? `${r.project.code} ${r.project.name}` : ""}>
                {r.project ? (
                  <span>
                    <span className="font-medium">{r.project.code}</span>
                    <span className="text-slate-500 dark:text-slate-400"> · {r.project.name}</span>
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs">
                <span className="text-slate-700 dark:text-slate-300">{r.documentStatus || "—"}</span>
                {r.documentUrl ? (
                  <a
                    href={r.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1.5 font-medium text-brand-600 underline dark:text-brand-400"
                  >
                    Open
                  </a>
                ) : null}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {r.director ? (
                  <span className="inline-flex items-center gap-2">
                    <DirectorAvatar director={r.director} size="sm" />
                    <span>{r.director.name}</span>
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {r.debitAccount}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  {r.creditAccount}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">
                {r.currency || "EUR"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-slate-900 dark:text-slate-100">
                {formatMoney(r.amount, r.currency || "EUR")}
              </td>
              {showDelete ? (
                <td className="px-4 py-3 text-right">
                  {role === "ADMIN" ? (
                    <button
                      disabled={isDeleting}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-900/60"
                      onClick={() => onDelete?.(r.id)}
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">Admin only</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
          {(rows || []).length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500 dark:text-slate-400" colSpan={colCount}>
                No transactions yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
