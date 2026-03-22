import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DirectorAvatar from "../components/DirectorAvatar";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { usePortfolio } from "../hooks/useDashboard";
import { listProjects } from "../api/projects";
import { eur } from "../lib/format";
import { PROJECT_STATUS, statusBadgeClass } from "../lib/projectLabels";

const KIND = "YPA";

export default function YPAWorkspace() {
  const qP = usePortfolio();
  const qProj = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  if (qP.isLoading || qProj.isLoading) return <Loading label="Loading YPA..." />;
  if (qP.error) return <ErrorBanner error={qP.error} />;
  if (qProj.error) return <ErrorBanner error={qProj.error} />;

  const p = qP.data;
  const ypa = p?.assets?.ypa ?? 0;
  const rows = (qProj.data || []).filter((x) => x.projectKind === KIND);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="font-semibold">YPA (Young Plantations / Goats) — balance sheet position</div>
        <div className="mt-1 text-emerald-800">
          Current YPA asset balance (from posted transactions):{" "}
          <span className="font-bold text-emerald-950">{eur(ypa)}</span>
        </div>
        <div className="mt-2 text-xs text-emerald-800">{`Use "Post Transaction" with type YPA_INVEST to move funds into this asset.`}</div>
      </div>

      <div>
        <div className="text-sm font-semibold text-slate-900">YPA projects</div>
        <div className="text-sm text-slate-600">
          Create projects with kind &quot;YPA&quot; to track leaders, budgets, and tasks for this program.
        </div>
      </div>

      <div className="ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Leader</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No YPA projects yet.{" "}
                  <Link className="font-medium text-brand-700 hover:underline" to="/projects">
                    All projects
                  </Link>{" "}
                  → New project → set program to YPA.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                      {PROJECT_STATUS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {p.budget != null ? eur(p.budget) : "—"}
                    {p.budgetSpent != null ? (
                      <span className="text-xs text-slate-500"> · spent {eur(p.budgetSpent)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {p.leaderDirector ? (
                      <span className="inline-flex items-center gap-2">
                        <DirectorAvatar director={p.leaderDirector} size="sm" />
                        <span>
                          {p.leaderDirector.name} ({p.leaderDirector.initials})
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.contactName || p.contactEmail || p.contactPhone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/project/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
