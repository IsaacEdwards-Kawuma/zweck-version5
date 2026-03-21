import { eur } from "../lib/format";

export default function DirectorCard({ director, maxTotal, onClick }) {
  const total = director?.total || 0;
  const pct = maxTotal > 0 ? Math.min(1, total / maxTotal) : 0;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
            {director?.initials || "—"}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{director?.name}</div>
            <div className="text-xs text-slate-500">{director?.email}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">{eur(total)}</div>
          <div className="text-xs text-slate-500">Total</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
        <div>
          <div className="font-medium text-slate-900">{eur(director?.capital || 0)}</div>
          <div>Capital</div>
        </div>
        <div>
          <div className="font-medium text-slate-900">{eur(director?.sideFund || 0)}</div>
          <div>Side fund</div>
        </div>
        <div className="text-right">
          <div className="font-medium text-slate-900">{Math.round(pct * 100)}%</div>
          <div>Relative</div>
        </div>
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </button>
  );
}

