import { Link, NavLink } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import DirectorAvatar from "./DirectorAvatar";
import { logout as logoutApi } from "../api/auth";
import { canAccessReports, hasAdminPrivileges, isSecretaryRole, isStaffRole, isUserRole } from "../lib/roles";

function buildLinks(role) {
  const staff = isStaffRole(role);
  const dashboardTo = isUserRole(role) ? "/user" : isSecretaryRole(role) ? "/secretary" : "/dashboard";
  return [
    { to: dashboardTo, label: "Dashboard", icon: "dashboard" },
    ...(isSecretaryRole(role) ? [{ to: "/crm", label: "Contacts", icon: "contacts" }] : []),
    ...(canAccessReports(role) ? [{ to: "/reports", label: "Reports", icon: "reports" }] : []),
    { to: "/meetings", label: "Meetings", icon: "meetings" },
    { to: "/chat", label: "Chat", icon: "chat" },
    { to: "/documents", label: "Documents", icon: "documents" },
    { to: "/forms", label: "Forms", icon: "forms" },
    ...(staff ? [{ to: "/post", label: "Post Transaction", icon: "post" }] : []),
    ...(staff ? [{ to: "/ledger", label: "Ledger", icon: "ledger" }] : []),
    ...(staff ? [{ to: "/reconciliation", label: "Reconciliation", icon: "reconcile" }] : []),
    ...(staff ? [{ to: "/accounts", label: "Chart of Accounts", icon: "accounts" }] : []),
    ...(staff ? [{ to: "/directors", label: "Directors", icon: "directors" }] : []),
    ...(staff ? [{ to: "/portfolio", label: "Portfolio", icon: "portfolio" }] : []),
    { to: "/invoices", label: "Invoices", icon: "invoices" },
    ...(staff ? [{ to: "/projects", label: "Projects", icon: "projects" }] : []),
    { to: "/help", label: "Help & guides", icon: "help" },
    { to: "/settings", label: "Settings", icon: "settings" }
  ];
}

function NavIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "h-[1.125rem] w-[1.125rem] shrink-0"
  };
  switch (name) {
    case "contacts":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
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
    case "forms":
      return (
        <svg {...common}>
          <path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4" />
          <path d="M13 3H9a2 2 0 0 0-2 2v1h8V5a2 2 0 0 0-2-2z" />
          <path d="m9 12 2 2 4-4" />
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
    case "invoices":
      return (
        <svg {...common}>
          <path d="M7 3h10l2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 7h8M8 11h6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M4 5h16v11H7l-3 3V5z" />
          <path d="M8 10h8" />
          <path d="M8 7h6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar({ mobileOpen, onClose, me }) {
  const nav = useNavigate();
  const links = buildLinks(me?.role);
  const profileName = me?.director?.name || (me?.email ? String(me.email).split("@")[0] : "Signed in user");
  const profileSubtitle = me?.email || "No email";
  const avatarDirector = me?.director || { name: profileName, initials: String(profileName).slice(0, 2).toUpperCase(), avatarUrl: null };
  const profileTarget = hasAdminPrivileges(me?.role) ? "/settings#settings-login-stamps" : "/settings#settings-account";
  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={[
          "fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] transition-[opacity,backdrop-filter] duration-300 ease-out lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        ].join(" ")}
        onClick={onClose}
      />
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex h-full w-[17rem] flex-col border-r border-white/20 bg-white/85 shadow-[4px_0_32px_-8px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] print:hidden dark:border-slate-600/50 dark:bg-slate-950/90 dark:shadow-[4px_0_40px_-6px_rgba(0,0,0,0.45)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shadow-[2px_0_24px_-12px_rgba(15,23,42,0.12)] dark:lg:shadow-[2px_0_28px_-8px_rgba(0,0,0,0.35)]"
        ].join(" ")}
      >
        <div className="ui-sidebar-brand ui-sidebar-brand-motion bg-gradient-to-br from-brand-600 via-sky-600 to-accent-600 px-4 py-6 text-white shadow-[0_8px_32px_-8px_rgba(37,99,235,0.45)]">
          <div className="pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full bg-white/15 blur-3xl motion-reduce:animate-none" aria-hidden />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-sky-300/20 blur-2xl motion-reduce:animate-none" aria-hidden />
          <div className="pointer-events-none absolute right-6 top-8 h-16 w-16 rounded-full bg-accent-300/25 blur-xl" aria-hidden />
          <div className="relative flex flex-col items-start gap-3 text-left">
            <Link
              to="/about"
              onClick={onClose}
              title="About the company"
              className="rounded-xl outline-none ring-offset-2 ring-offset-brand-700 transition-transform duration-300 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <img
                src="/zweck-logo.png"
                alt="Zweck logo — about the company"
                className="h-12 w-auto shrink-0 rounded-xl bg-white/95 p-1.5 shadow-lg ring-2 ring-white/30 sm:h-14 lg:h-16"
              />
            </Link>
            <div>
              <div className="text-lg font-bold tracking-tight drop-shadow-sm">ZweckOS</div>
              <div className="mt-1 text-xs font-medium text-white/90">Zweck Co. Ltd — Kampala</div>
            </div>
          </div>
        </div>

        <nav
          className="ui-sidebar-nav flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-4"
          aria-label="Main navigation"
        >
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/dashboard" || l.to === "/user" || l.to === "/secretary"}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  "group relative block overflow-hidden rounded-xl border-l-[3px] outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400/90 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-500/80 dark:focus-visible:ring-offset-slate-950",
                  isActive
                    ? "border-brand-500 bg-gradient-to-r from-brand-50 via-white to-sky-50/90 text-brand-900 shadow-md shadow-brand-500/15 ring-1 ring-brand-200/60 dark:border-brand-400 dark:from-brand-950/95 dark:via-slate-900 dark:to-slate-800/95 dark:text-brand-50 dark:shadow-brand-900/40 dark:ring-brand-500/25"
                    : "border-transparent text-slate-700 hover:border-brand-200/90 hover:bg-white/95 hover:shadow-sm dark:text-slate-300 dark:hover:border-brand-500/40 dark:hover:bg-slate-800/95 dark:hover:text-brand-100"
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <span className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={[
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 motion-reduce:transition-none",
                      isActive
                        ? "bg-brand-500/20 text-brand-800 shadow-inner dark:bg-brand-400/25 dark:text-brand-100"
                        : "bg-slate-100/95 text-slate-500 group-hover:scale-105 group-hover:bg-brand-100/90 group-hover:text-brand-800 dark:bg-slate-800/90 dark:text-slate-400 dark:group-hover:scale-105 dark:group-hover:bg-slate-700 dark:group-hover:text-brand-200"
                    ].join(" ")}
                  >
                    <NavIcon name={l.icon} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.label}</span>
                  {isActive ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-brand-500 shadow-[0_0_12px_rgba(37,99,235,0.55)] motion-reduce:shadow-none dark:bg-brand-400 dark:shadow-[0_0_12px_rgba(96,165,250,0.45)]"
                      aria-hidden
                    />
                  ) : null}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="relative border-t border-slate-200/90 bg-gradient-to-b from-slate-50/98 via-white to-white px-3 py-4 dark:border-slate-700/90 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand-200/50 to-transparent dark:via-brand-500/25"
            aria-hidden
          />
          <button
            type="button"
            className="group/profile mb-3 w-full rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-3 text-left shadow-sm ring-1 ring-slate-100/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-gradient-to-br hover:from-brand-50/80 hover:to-white hover:shadow-md hover:ring-brand-200/50 dark:border-slate-700 dark:bg-slate-800/90 dark:ring-slate-700/80 dark:hover:border-brand-500/40 dark:hover:from-slate-800 dark:hover:to-slate-800/95"
            onClick={() => {
              onClose?.();
              nav(profileTarget);
            }}
            title="Open account settings"
          >
            <div className="flex items-center gap-3">
              <span className="relative shrink-0 transition-transform duration-200 group-hover/profile:scale-105 motion-reduce:group-hover/profile:scale-100">
                <DirectorAvatar director={avatarDirector} size="sm" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-800" title="Session" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{profileName}</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{profileSubtitle}</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-brand-200/90 bg-white px-3 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-md active:translate-y-0 dark:border-brand-500/45 dark:bg-slate-800 dark:text-brand-200 dark:hover:bg-slate-700"
            onClick={async () => {
              try {
                await logoutApi();
              } catch {
                // Best effort: token may already be invalid/expired.
              }
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
