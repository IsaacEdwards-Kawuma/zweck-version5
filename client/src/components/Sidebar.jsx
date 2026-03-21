import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/reports", label: "Reports" },
  { to: "/post", label: "Post Transaction" },
  { to: "/ledger", label: "Ledger" },
  { to: "/accounts", label: "Chart of Accounts" },
  { to: "/directors", label: "Directors" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/mmf", label: "MMF Tracker" },
  { to: "/circulation", label: "Circulation Rounds" }
];

export default function Sidebar() {
  return (
    <aside className="h-full w-64 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-4 py-4">
        <div className="text-lg font-semibold text-slate-900">ZweckOS</div>
        <div className="text-xs text-slate-500">Zweck Co. Ltd — Kampala</div>
      </div>
      <nav className="px-2 pb-4">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2 text-sm font-medium",
                isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
              ].join(" ")
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

