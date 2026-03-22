import { eur } from "../lib/format";
import DirectorAvatar from "./DirectorAvatar";

export default function DirectorCard({ director, maxTotal, onClick }) {
  const total = director?.total || 0;
  const pct = maxTotal > 0 ? Math.min(1, total / maxTotal) : 0;

  return (
    <button
      onClick={onClick}
      className="ui-surface w-full rounded-xl p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DirectorAvatar director={director} size="md" />
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{director?.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{director?.email}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{eur(total)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-300">
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{eur(director?.capital || 0)}</div>
          <div>Capital</div>
        </div>
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{eur(director?.sideFund || 0)}</div>
          <div>Side fund</div>
        </div>
        <div className="text-right">
          <div className="font-medium text-slate-900 dark:text-slate-100">{Math.round(pct * 100)}%</div>
          <div>Relative</div>
        </div>
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700/80">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </button>
  );
}
