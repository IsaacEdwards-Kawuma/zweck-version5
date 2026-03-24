import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/reports", label: "Reports" },
  { to: "/meetings", label: "Meetings" },
  { to: "/documents", label: "Documents" },
  { to: "/post", label: "Post Transaction" },
  { to: "/ledger", label: "Ledger" },
  { to: "/reconciliation", label: "Reconciliation" },
  { to: "/accounts", label: "Chart of Accounts" },
  { to: "/directors", label: "Directors" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/projects", label: "Projects" },
  { to: "/settings", label: "Settings" }
];

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={[
          "fixed inset-0 z-30 bg-slate-900/45 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        ].join(" ")}
        onClick={onClose}
      />
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 h-full w-64 border-r border-brand-100/80 bg-white/95 shadow-sm shadow-brand-900/5 transition-transform print:hidden dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-black/20",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-auto lg:translate-x-0"
        ].join(" ")}
      >
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-accent-600 px-4 py-5 text-white shadow-md shadow-brand-900/20">
        <div className="flex items-center gap-2">
          <img src="/zweck-logo.png" alt="Zweck logo" className="h-8 w-auto rounded-md bg-white/90 p-1" />
          <div>
            <div className="text-lg font-semibold tracking-tight">ZweckOS</div>
            <div className="mt-0.5 text-xs font-medium text-white/85">Zweck Co. Ltd — Kampala</div>
          </div>
        </div>
      </div>
      <nav className="space-y-0.5 px-2 pb-4 pt-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            onClick={onClose}
            className={({ isActive }) =>
              [
                "block rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-brand-500 bg-gradient-to-r from-brand-50 to-accent-50 text-brand-800 dark:border-brand-400 dark:from-brand-950/90 dark:to-slate-800/90 dark:text-brand-100"
                  : "border-transparent text-slate-700 hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-800 dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:bg-slate-800/90 dark:hover:text-brand-200"
              ].join(" ")
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      </aside>
    </>
  );
}

