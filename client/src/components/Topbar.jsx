import { Link } from "react-router-dom";

export default function Topbar({ onToggleNav }) {
  return (
    <header className="flex items-center justify-between border-b border-brand-100/70 bg-white/90 px-3 py-2 backdrop-blur-sm print:hidden sm:px-4 md:px-6 md:py-3 dark:border-slate-700 dark:bg-slate-900/90">
      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleNav}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-label="Toggle navigation"
      >
        Menu
      </button>
      <div className="hidden items-center gap-2 sm:flex">
        <img src="/zweck-logo.png" alt="Zweck logo" className="h-7 w-auto rounded bg-white p-1 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-600" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">ZweckOS</span>
      </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:px-3 sm:text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Settings
        </Link>
      </div>
    </header>
  );
}
