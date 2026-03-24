export default function Topbar({ onToggleNav }) {
  return (
    <header className="flex items-center border-b border-brand-100/70 bg-white/90 px-3 py-2 backdrop-blur-sm print:hidden sm:px-4 md:px-6 md:py-3 dark:border-slate-700 dark:bg-slate-900/90">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleNav}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm lg:hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          aria-label="Toggle navigation"
        >
          Menu
        </button>
      </div>
    </header>
  );
}
