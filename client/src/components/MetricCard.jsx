export default function MetricCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="ui-animate-pop ui-surface group relative overflow-hidden rounded-xl p-4">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-brand-500/5 to-sky-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
          {sub ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div> : null}
        </div>
        {Icon ? (
          <span className="shrink-0 rounded-xl bg-gradient-to-br from-brand-500/15 to-sky-500/10 p-2.5 text-brand-600 shadow-sm ring-1 ring-brand-500/10 dark:text-brand-400 dark:ring-brand-400/20">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
