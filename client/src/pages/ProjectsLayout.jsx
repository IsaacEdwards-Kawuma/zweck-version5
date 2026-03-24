import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/projects", end: true, label: "All projects" }
];

export default function ProjectsLayout() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold text-slate-900">Projects workspace</div>
        <div className="text-sm text-slate-600">
          Operational projects — budgets, leaders, and contacts per project.
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              [
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              ].join(" ")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
