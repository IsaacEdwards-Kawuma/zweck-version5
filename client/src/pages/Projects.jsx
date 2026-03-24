import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DirectorAvatar from "../components/DirectorAvatar";
import PrintStatementHeader from "../components/PrintStatementHeader";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listProjects, createProject } from "../api/projects";
import { useDirectorsAll } from "../hooks/useDashboard";
import { fmtDate } from "../lib/format";
import {
  PROJECT_KIND,
  PROJECT_STATUS,
  PRIORITY,
  statusBadgeClass,
  priorityBadgeClass
} from "../lib/projectLabels";

const STATUSES = Object.keys(PROJECT_STATUS);
const KINDS = Object.keys(PROJECT_KIND);
const PRIORITIES = Object.keys(PRIORITY);

export default function Projects() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const qDirs = useDirectorsAll();
  const [filter, setFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("UPDATED_DESC");
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "PLANNING",
    priority: "MEDIUM",
    projectKind: "GENERAL",
    startDate: "",
    endDate: "",
    budget: "",
    budgetSpent: "",
    budgetCurrency: "EUR",
    leaderDirectorId: "",
    contactName: "",
    contactEmail: "",
    contactPhone: ""
  });

  const mCreate = useMutation({
    mutationFn: () =>
      createProject({
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        projectKind: form.projectKind,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        budget: form.budget === "" ? null : Number(form.budget),
        budgetSpent: form.budgetSpent === "" ? null : Number(form.budgetSpent),
        budgetCurrency: form.budgetCurrency || "EUR",
        leaderDirectorId: form.leaderDirectorId === "" ? null : Number(form.leaderDirectorId),
        contactName: form.contactName.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null
      }),
    onSuccess: async () => {
      setForm({
        name: "",
        description: "",
        status: "PLANNING",
        priority: "MEDIUM",
        projectKind: "GENERAL",
        startDate: "",
        endDate: "",
        budget: "",
        budgetSpent: "",
        budgetCurrency: "EUR",
        leaderDirectorId: "",
        contactName: "",
        contactEmail: "",
        contactPhone: ""
      });
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const projectList = useMemo(() => (Array.isArray(q.data) ? q.data : []), [q.data]);

  const rows = useMemo(() => {
    let out = projectList.filter((p) => {
      if (filter && p.status !== filter) return false;
      if (kindFilter && p.projectKind !== kindFilter) return false;
      if (priorityFilter && p.priority !== priorityFilter) return false;
      if (overBudgetOnly && !isOverBudget(p)) return false;
      if (query.trim()) {
        const hay = `${p.code || ""} ${p.name || ""} ${p.description || ""} ${p.contactName || ""}`.toLowerCase();
        if (!hay.includes(query.toLowerCase().trim())) return false;
      }
      return true;
    });

    if (sortBy === "UPDATED_DESC") {
      out = out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    } else if (sortBy === "PROGRESS_DESC") {
      out = out.sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0));
    } else if (sortBy === "BUDGET_DESC") {
      out = out.sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0));
    } else if (sortBy === "NAME_ASC") {
      out = out.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    return out;
  }, [projectList, filter, kindFilter, priorityFilter, overBudgetOnly, query, sortBy]);

  const stats = useMemo(() => {
    const all = projectList;
    return {
      total: all.length,
      active: all.filter((p) => p.status === "IN_PROGRESS").length,
      complete: all.filter((p) => p.status === "COMPLETED").length,
      overBudget: all.filter((p) => isOverBudget(p)).length,
      highPriority: all.filter((p) => p.priority === "HIGH" || p.priority === "CRITICAL").length
    };
  }, [projectList]);

  const directors = Array.isArray(qDirs.data) ? qDirs.data : [];

  if (q.isLoading) return <Loading label="Loading projects..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  function exportCsv() {
    const headers = ["code", "name", "program", "status", "priority", "budget", "budgetSpent", "progress", "tasksDone", "tasksTotal", "updatedAt"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map((p) =>
        [
          esc(p.code),
          esc(p.name),
          esc(PROJECT_KIND[p.projectKind] || p.projectKind),
          esc(PROJECT_STATUS[p.status] || p.status),
          esc(PRIORITY[p.priority] || p.priority),
          esc(p.budget),
          esc(maxSpend(p)),
          esc(p.progress ?? 0),
          esc(p.doneCount ?? 0),
          esc(p.taskCount ?? 0),
          esc(p.updatedAt)
        ].join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projects-portfolio.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ui-animate-in space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        <StatCard label="Total projects" value={stats.total} />
        <StatCard label="In progress" value={stats.active} />
        <StatCard label="Completed" value={stats.complete} />
        <StatCard label="Over budget" value={stats.overBudget} />
        <StatCard label="High priority" value={stats.highPriority} />
      </section>

      <div className="ui-surface rounded-xl p-3 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="text-sm ui-page-muted">
          Create projects, set leaders, contacts, budgets, then open a project for tasks and spend tracking.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="ui-input px-2 py-1.5"
            placeholder="Search code, name, contact..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="ui-input px-2 py-1.5"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            <option value="">All programs</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND[k]}
              </option>
            ))}
          </select>
          <select
            className="ui-input px-2 py-1.5"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p]}
              </option>
            ))}
          </select>
          <select
            className="ui-input px-2 py-1.5"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS[s]}
              </option>
            ))}
          </select>
          <select className="ui-input px-2 py-1.5" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="UPDATED_DESC">Sort: Recently updated</option>
            <option value="PROGRESS_DESC">Sort: Progress high-low</option>
            <option value="BUDGET_DESC">Sort: Budget high-low</option>
            <option value="NAME_ASC">Sort: Name A-Z</option>
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
            <input type="checkbox" checked={overBudgetOnly} onChange={(e) => setOverBudgetOnly(e.target.checked)} />
            Over budget only
          </label>
          <button type="button" className="ui-btn-outline" onClick={exportCsv}>
            Export CSV
          </button>
          <button type="button" className="ui-btn-outline" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New project"}
          </button>
        </div>
      </div>
      </div>

      <PrintStatementHeader
        title="Project portfolio"
        subtitle="All programmes and project leaders"
        meta={`Generated ${new Date().toLocaleString()} · ZweckOS`}
      />

      {showForm ? (
        <form
          className="ui-animate-pop space-y-3 rounded-xl ui-surface p-4 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return;
            mCreate.mutate();
          }}
        >
          <div className="text-sm font-semibold text-slate-900">New project</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Name *</label>
              <input
                className="ui-input mt-1 w-full"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Description</label>
              <textarea
                className="ui-input mt-1 w-full"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Status</label>
              <select
                className="ui-input mt-1 w-full"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Priority</label>
              <select
                className="ui-input mt-1 w-full"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {Object.keys(PRIORITY).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Start date</label>
              <input
                type="date"
                className="ui-input mt-1 w-full"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Target end date</label>
              <input
                type="date"
                className="ui-input mt-1 w-full"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Program</label>
              <select
                className="ui-input mt-1 w-full"
                value={form.projectKind}
                onChange={(e) => setForm((f) => ({ ...f, projectKind: e.target.value }))}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PROJECT_KIND[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Project leader</label>
              <select
                className="ui-input mt-1 w-full"
                value={form.leaderDirectorId}
                onChange={(e) => setForm((f) => ({ ...f, leaderDirectorId: e.target.value }))}
              >
                <option value="">—</option>
                {directors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Budget (planned)</label>
              <input
                className="ui-input mt-1 w-full"
                inputMode="decimal"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Budget spent (recorded)</label>
              <input
                className="ui-input mt-1 w-full"
                inputMode="decimal"
                value={form.budgetSpent}
                onChange={(e) => setForm((f) => ({ ...f, budgetSpent: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Currency</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.budgetCurrency}
                onChange={(e) => setForm((f) => ({ ...f, budgetCurrency: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Contact person</label>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  className="ui-input"
                  placeholder="Name"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
                <input
                  className="ui-input"
                  placeholder="Email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                />
                <input
                  className="ui-input"
                  placeholder="Phone"
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <button type="submit" disabled={mCreate.isPending || qDirs.isLoading} className="ui-btn-outline">
            {mCreate.isPending ? "Saving…" : "Create project"}
          </button>
        </form>
      ) : null}

      <div className="ui-animate-pop ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="ui-table-head">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Program</th>
              <th className="px-4 py-3">Leader</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Tasks</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 print:hidden"> </th>
            </tr>
          </thead>
          <tbody className="ui-table-divide">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No projects yet. Add one to get started.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="ui-table-row-hover">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{PROJECT_KIND[p.projectKind] || p.projectKind}</td>
                  <td className="max-w-[200px] px-4 py-3 text-xs text-slate-700">
                    {p.leaderDirector ? (
                      <span className="inline-flex max-w-full items-center gap-2">
                        <DirectorAvatar director={p.leaderDirector} size="sm" />
                        <span className="min-w-0 truncate">{p.leaderDirector.name}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                      {PROJECT_STATUS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(p.priority)}`}>
                      {PRIORITY[p.priority] || p.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {p.budget != null ? `${Number(p.budget).toLocaleString()} ${p.budgetCurrency || "EUR"}` : "—"}
                    {isOverBudget(p) ? <div className="text-[10px] font-semibold text-rose-700">Over budget</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand-600"
                          style={{ width: `${Math.min(100, p.progress || 0)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">{p.progress ?? 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {p.doneCount ?? 0}/{p.taskCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(p.updatedAt)}</td>
                  <td className="px-4 py-3 print:hidden">
                    <Link
                      to={`/project/${p.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end print:hidden">
        <button
          type="button"
          className="ui-btn-outline font-medium text-slate-800"
          onClick={() => window.print()}
        >
          Print portfolio
        </button>
      </div>
    </div>
  );
}

function maxSpend(project) {
  return Math.max(Number(project?.budgetSpent || 0), Number(project?.spentFromTasks || 0));
}

function isOverBudget(project) {
  if (project?.budget == null) return false;
  return maxSpend(project) > Number(project.budget);
}

function StatCard({ label, value }) {
  return (
    <div className="ui-surface rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
