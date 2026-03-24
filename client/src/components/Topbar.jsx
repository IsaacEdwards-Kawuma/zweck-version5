export default function Topbar({ onToggleNav }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-brand-100/60 bg-white/75 px-3 py-2 backdrop-blur-md print:hidden sm:px-4 md:px-6 md:py-3 dark:border-slate-700/70 dark:bg-slate-900/70">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleNav}
          className="rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-sm lg:hidden dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Toggle navigation"
        >
          Menu
        </button>
      </div>
      <div className="hidden text-xs font-medium tracking-wide text-slate-500 sm:block dark:text-slate-400">ZweckOS Workspace</div>
    </header>
  );
}
