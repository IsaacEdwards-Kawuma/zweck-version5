/**
 * Page header with optional icon, gradient panel, and action slot.
 */
export default function PageHero({ icon: Icon, title, subtitle, children, className = "" }) {
  return (
    <div
      className={`ui-animate-in relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-brand-50/50 to-sky-50/40 p-6 shadow-sm dark:border-slate-700/80 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950/40 ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-500/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl dark:bg-brand-400/10"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          {Icon ? (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-sky-600 text-white shadow-md shadow-brand-600/25 ring-4 ring-white/80 dark:ring-slate-900/80"
              aria-hidden
            >
              <Icon className="h-7 w-7" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight ui-page-heading">{title}</h1>
            {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed ui-page-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div> : null}
      </div>
    </div>
  );
}

/** Section title with accent bar — use inside cards */
export function SectionTitle({ icon: Icon, children, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 to-sky-500" aria-hidden />
      {Icon ? (
        <span className="text-brand-600 dark:text-brand-400">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <h2 className="text-lg font-semibold ui-page-heading">{children}</h2>
    </div>
  );
}
