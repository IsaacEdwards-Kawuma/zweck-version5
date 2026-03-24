import { NavLink } from "react-router-dom";
import { useNavigate } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/reports", label: "Reports", icon: "reports" },
  { to: "/meetings", label: "Meetings", icon: "meetings" },
  { to: "/documents", label: "Documents", icon: "documents" },
  { to: "/post", label: "Post Transaction", icon: "post" },
  { to: "/ledger", label: "Ledger", icon: "ledger" },
  { to: "/reconciliation", label: "Reconciliation", icon: "reconcile" },
  { to: "/accounts", label: "Chart of Accounts", icon: "accounts" },
  { to: "/directors", label: "Directors", icon: "directors" },
  { to: "/portfolio", label: "Portfolio", icon: "portfolio" },
  { to: "/projects", label: "Projects", icon: "projects" },
  { to: "/settings", label: "Settings", icon: "settings" }
];

function NavIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-4 w-4 shrink-0"
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="11" width="7" height="10" />
          <rect x="3" y="13" width="7" height="8" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M5 3h10l4 4v14H5z" />
          <path d="M15 3v5h5" />
          <path d="M8 13h8M8 17h8M8 9h4" />
        </svg>
      );
    case "meetings":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case "documents":
      return (
        <svg {...common}>
          <path d="M6 2h9l5 5v15H6z" />
          <path d="M15 2v5h5M9 12h8M9 16h8" />
        </svg>
      );
    case "post":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "ledger":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "reconcile":
      return (
        <svg {...common}>
          <path d="M3 7h13M3 12h10M3 17h7" />
          <path d="m14 15 2 2 5-5" />
        </svg>
      );
    case "accounts":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="7" cy="7" r="1" />
          <circle cx="7" cy="12" r="1" />
          <circle cx="7" cy="17" r="1" />
        </svg>
      );
    case "directors":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="18" cy="9" r="2" />
          <path d="M15 20a4.5 4.5 0 0 1 6 0" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...common}>
          <path d="M3 20h18" />
          <path d="M7 16V9M12 16V5M17 16v-3" />
        </svg>
      );
    case "projects":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 4v14M3 9h18" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar({ mobileOpen, onClose }) {
  const nav = useNavigate();
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
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-brand-100/80 bg-white/95 shadow-sm shadow-brand-900/5 transition-transform duration-300 print:hidden dark:border-slate-700 dark:bg-slate-900/95 dark:shadow-black/20",
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
      <nav className="flex-1 space-y-0.5 px-2 pb-4 pt-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            onClick={onClose}
            className={({ isActive }) =>
              [
                "group block rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "border-brand-500 bg-gradient-to-r from-brand-50 to-accent-50 text-brand-800 shadow-sm dark:border-brand-400 dark:from-brand-950/90 dark:to-slate-800/90 dark:text-brand-100"
                  : "border-transparent text-slate-700 hover:translate-x-1 hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-800 dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:bg-slate-800/90 dark:hover:text-brand-200"
              ].join(" ")
            }
          >
            <span className="flex items-center gap-2">
              <span className="transition-transform duration-200 group-hover:scale-110">
                <NavIcon name={l.icon} />
              </span>
              <span>{l.label}</span>
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">
        <button
          type="button"
          className="w-full rounded-lg border border-brand-200/80 bg-white px-3 py-2 text-sm font-medium text-brand-900 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-sm dark:border-brand-500/40 dark:bg-slate-800 dark:text-brand-200 dark:hover:bg-slate-700"
          onClick={() => {
            localStorage.removeItem("zweck_token");
            onClose?.();
            nav("/");
          }}
        >
          Logout
        </button>
      </div>
      </aside>
    </>
  );
}

