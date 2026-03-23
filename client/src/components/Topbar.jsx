import { useNavigate, Link } from "react-router-dom";

export default function Topbar() {
  const nav = useNavigate();

  return (
    <header className="flex items-center justify-end border-b border-brand-100/70 bg-white/90 px-6 py-3 backdrop-blur-sm print:hidden dark:border-slate-700 dark:bg-slate-900/90">
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Settings
        </Link>
        <button
          type="button"
          className="rounded-lg border border-brand-200/80 bg-white px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-50 dark:border-brand-500/40 dark:bg-slate-800 dark:text-brand-200 dark:hover:bg-slate-700"
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
