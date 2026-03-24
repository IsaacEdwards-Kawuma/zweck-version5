import { useNavigate, Link } from "react-router-dom";

export default function Topbar({ onToggleNav }) {
  const nav = useNavigate();

  return (
    <header className="flex items-center justify-between border-b border-brand-100/70 bg-white/90 px-3 py-2 backdrop-blur-sm print:hidden sm:px-4 md:px-6 md:py-3 dark:border-slate-700 dark:bg-slate-900/90">
      <button
        type="button"
        onClick={onToggleNav}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 lg:hidden dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-label="Toggle navigation"
      >
        Menu
      </button>
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:px-3 sm:text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Settings
        </Link>
        <button
          type="button"
          className="rounded-lg border border-brand-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-900 hover:bg-brand-50 sm:px-3 sm:text-sm dark:border-brand-500/40 dark:bg-slate-800 dark:text-brand-200 dark:hover:bg-slate-700"
          onClick={() => {
            localStorage.removeItem("zweck_token");
            nav("/");
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
