import { useNavigate, Link } from "react-router-dom";

export default function Topbar({ me }) {
  const nav = useNavigate();
  const role = me?.role || "";

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>
          Signed in as{" "}
          <span className="font-medium text-slate-900">{me?.email || "—"}</span>
        </span>
        {role ? (
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
            {role}
          </span>
        ) : null}
        {role === "ADMIN" && (
          <Link
            to="/users"
            className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
          >
            Admin
          </Link>
        )}
      </div>
      <button
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        onClick={() => {
          localStorage.removeItem("zweck_token");
          nav("/login");
        }}
      >
        Logout
      </button>
    </header>
  );
}

