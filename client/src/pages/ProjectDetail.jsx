import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import DirectorAvatar from "../components/DirectorAvatar";
import PrintStatementHeader from "../components/PrintStatementHeader";
import {
  getProject,
  updateProject,
  deleteProject,
  createTask,
  updateTask,
  deleteTask
} from "../api/projects";
import { useDirectorsAll } from "../hooks/useDashboard";
import { eur, fmtDate } from "../lib/format";
import {
  PROJECT_KIND,
  PROJECT_STATUS,
  PRIORITY,
  TASK_STATUS,
  statusBadgeClass,
  priorityBadgeClass
} from "../lib/projectLabels";

const TASK_ORDER = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"];
const PROJECT_STATUSES = Object.keys(PROJECT_STATUS);

function toDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function ProjectDetail() {
  const { id: routeId } = useParams();
  const projectId = Number(routeId);
  const nav = useNavigate();
  const { me } = useOutletContext() || {};
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: Number.isFinite(projectId)
  });
  const qDirs = useDirectorsAll();

  const [editing, setEditing] = useState(false);
  const [projectForm, setProjectForm] = useState(null);

  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: "",
    assigneeDirectorId: "",
    estimatedCost: "",
    actualCost: ""
  });
  const [taskQuery, setTaskQuery] = useState("");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  const mUpdate = useMutation({
    mutationFn: () =>
      updateProject(projectId, {
        name: projectForm.name.trim(),
        description: projectForm.description.trim() || null,
        status: projectForm.status,
        priority: projectForm.priority,
        projectKind: projectForm.projectKind,
        startDate: projectForm.startDate ? new Date(projectForm.startDate).toISOString() : null,
        endDate: projectForm.endDate ? new Date(projectForm.endDate).toISOString() : null,
        budget: projectForm.budget === "" ? null : Number(projectForm.budget),
        budgetSpent: projectForm.budgetSpent === "" ? null : Number(projectForm.budgetSpent),
        budgetCurrency: projectForm.budgetCurrency || "EUR",
        leaderDirectorId: projectForm.leaderDirectorId === "" ? null : Number(projectForm.leaderDirectorId),
        contactName: projectForm.contactName.trim() || null,
        contactEmail: projectForm.contactEmail.trim() || null,
        contactPhone: projectForm.contactPhone.trim() || null
      }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["project", projectId] }),
        qc.invalidateQueries({ queryKey: ["projects"] })
      ]);
    }
  });

  const mDelete = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      nav("/projects");
    }
  });

  const mCreateTask = useMutation({
    mutationFn: () =>
      createTask(projectId, {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        status: taskForm.status,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null,
        assigneeDirectorId: taskForm.assigneeDirectorId ? Number(taskForm.assigneeDirectorId) : null,
        estimatedCost: taskForm.estimatedCost === "" ? null : Number(taskForm.estimatedCost),
        actualCost: taskForm.actualCost === "" ? null : Number(taskForm.actualCost)
      }),
    onSuccess: async () => {
      setTaskForm({
        title: "",
        description: "",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: "",
        assigneeDirectorId: "",
        estimatedCost: "",
        actualCost: ""
      });
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const mUpdateTask = useMutation({
    mutationFn: ({ taskId, payload }) => updateTask(projectId, taskId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const mDeleteTask = useMutation({
    mutationFn: (taskId) => deleteTask(projectId, taskId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const filteredTasks = useMemo(() => {
    const tasks = q.data?.tasks || [];
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((t) => {
      if (taskPriorityFilter && t.priority !== taskPriorityFilter) return false;
      if (taskAssigneeFilter && String(t.assigneeDirectorId || "") !== String(taskAssigneeFilter)) return false;
      if (showOverdueOnly && !(t.dueDate && t.dueDate.slice(0, 10) < today && t.status !== "DONE")) return false;
      if (taskQuery.trim()) {
        const hay = `${t.title || ""} ${t.description || ""} ${t.assignee?.name || ""}`.toLowerCase();
        if (!hay.includes(taskQuery.toLowerCase().trim())) return false;
      }
      return true;
    });
  }, [q.data?.tasks, taskPriorityFilter, taskAssigneeFilter, showOverdueOnly, taskQuery]);

  const tasksByStatus = useMemo(() => {
    const map = {};
    for (const t of filteredTasks) {
      if (!map[t.status]) map[t.status] = [];
      map[t.status].push(t);
    }
    return map;
  }, [filteredTasks]);

  const taskStats = useMemo(() => {
    const all = q.data?.tasks || [];
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: all.length,
      done: all.filter((t) => t.status === "DONE").length,
      overdue: all.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today && t.status !== "DONE").length,
      blocked: all.filter((t) => t.status === "BLOCKED").length
    };
  }, [q.data?.tasks]);

  if (!Number.isFinite(projectId)) return <Navigate to="/projects" replace />;
  if (q.isLoading) return <Loading label="Loading project..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const p = q.data;

  const openEdit = () => {
    setProjectForm({
      name: p.name,
      description: p.description || "",
      status: p.status,
      priority: p.priority,
      projectKind: p.projectKind || "GENERAL",
      startDate: toDateInput(p.startDate),
      endDate: toDateInput(p.endDate),
      budget: p.budget != null ? String(p.budget) : "",
      budgetSpent: p.budgetSpent != null ? String(p.budgetSpent) : "",
      budgetCurrency: p.budgetCurrency || "EUR",
      leaderDirectorId: p.leaderDirectorId != null ? String(p.leaderDirectorId) : "",
      contactName: p.contactName || "",
      contactEmail: p.contactEmail || "",
      contactPhone: p.contactPhone || ""
    });
    setEditing(true);
  };

  const directors = qDirs.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="text-xs font-mono text-slate-500">{p.code}</div>
          <div className="text-lg font-semibold text-slate-900">{p.name}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
              {PROJECT_KIND[p.projectKind] || p.projectKind}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}>
              {PROJECT_STATUS[p.status]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(p.priority)}`}>
              {PRIORITY[p.priority]}
            </span>
            <span>Progress {p.progress ?? 0}%</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-btn-outline font-medium"
            onClick={() => window.print()}
          >
            Print report
          </button>
          {!editing ? (
            <button
              type="button"
              className="ui-btn-outline font-medium"
              onClick={openEdit}
            >
              Edit project
            </button>
          ) : null}
          {me?.role === "ADMIN" ? (
            <button
              type="button"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100"
              onClick={() => {
                if (window.confirm("Delete this project and all its tasks?")) mDelete.mutate();
              }}
            >
              Delete
            </button>
          ) : null}
          <Link to="/projects" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200">
            All projects
          </Link>
        </div>
      </div>

      {editing && projectForm ? (
        <form
          className="space-y-3 rounded-xl ui-surface p-4 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            mUpdate.mutate();
          }}
        >
          <div className="text-sm font-semibold text-slate-900">Edit project</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Name</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.name}
                onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Description</label>
              <textarea
                className="mt-1 w-full rounded-lg border-slate-300"
                rows={3}
                value={projectForm.description}
                onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Status</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.status}
                onChange={(e) => setProjectForm((f) => ({ ...f, status: e.target.value }))}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Priority</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.priority}
                onChange={(e) => setProjectForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {Object.keys(PRIORITY).map((x) => (
                  <option key={x} value={x}>
                    {PRIORITY[x]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Start</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.startDate}
                onChange={(e) => setProjectForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Target end</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.endDate}
                onChange={(e) => setProjectForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Program</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.projectKind}
                onChange={(e) => setProjectForm((f) => ({ ...f, projectKind: e.target.value }))}
              >
                {Object.keys(PROJECT_KIND).map((k) => (
                  <option key={k} value={k}>
                    {PROJECT_KIND[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Project leader (director)</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.leaderDirectorId}
                onChange={(e) => setProjectForm((f) => ({ ...f, leaderDirectorId: e.target.value }))}
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
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.budget}
                onChange={(e) => setProjectForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Budget spent (recorded)</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.budgetSpent}
                onChange={(e) => setProjectForm((f) => ({ ...f, budgetSpent: e.target.value }))}
                placeholder="Manual tracking"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Currency</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={projectForm.budgetCurrency}
                onChange={(e) => setProjectForm((f) => ({ ...f, budgetCurrency: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Contact person</label>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  className="rounded-lg border-slate-300"
                  placeholder="Name"
                  value={projectForm.contactName}
                  onChange={(e) => setProjectForm((f) => ({ ...f, contactName: e.target.value }))}
                />
                <input
                  className="rounded-lg border-slate-300"
                  placeholder="Email"
                  type="email"
                  value={projectForm.contactEmail}
                  onChange={(e) => setProjectForm((f) => ({ ...f, contactEmail: e.target.value }))}
                />
                <input
                  className="rounded-lg border-slate-300"
                  placeholder="Phone"
                  value={projectForm.contactPhone}
                  onChange={(e) => setProjectForm((f) => ({ ...f, contactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={mUpdate.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={() => {
                setEditing(false);
                setProjectForm(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid grid-cols-1 gap-3 rounded-xl ui-surface p-4 md:grid-cols-2 lg:grid-cols-3 print:hidden">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Owner</div>
          <div className="mt-0.5 text-sm font-medium text-slate-900">{p.creator?.email || "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Project leader</div>
          <div className="mt-0.5 flex items-center gap-2 text-sm font-medium text-slate-900">
            {p.leaderDirector ? (
              <>
                <DirectorAvatar director={p.leaderDirector} size="sm" />
                <span>
                  {p.leaderDirector.name} ({p.leaderDirector.initials})
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Contact person</div>
          <div className="mt-0.5 text-sm text-slate-800">
            {p.contactName || "—"}
            {p.contactEmail ? <div className="text-xs text-slate-600">{p.contactEmail}</div> : null}
            {p.contactPhone ? <div className="text-xs text-slate-600">{p.contactPhone}</div> : null}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Timeline</div>
          <div className="mt-0.5 text-sm text-slate-800">
            {p.startDate ? fmtDate(p.startDate) : "—"} → {p.endDate ? fmtDate(p.endDate) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Tasks</div>
          <div className="mt-0.5 text-sm font-medium text-slate-900">
            {(p.tasks || []).filter((t) => t.status === "DONE").length}/{(p.tasks || []).length} done
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Program workspace</div>
          <div className="mt-0.5 text-sm">
            <span className="text-slate-500">—</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 print:hidden">
        <div className="text-sm font-semibold text-emerald-950">Budget tracking</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-800">Planned budget</div>
            <div className="text-lg font-semibold text-emerald-950">
              {p.budget != null ? `${eur(p.budget)} ${p.budgetCurrency || "EUR"}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-800">Recorded spend</div>
            <div className="text-lg font-semibold text-emerald-950">
              {p.budgetSpent != null ? eur(p.budgetSpent) : "—"}
            </div>
            <div className="text-[10px] text-emerald-800">Manual total</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-800">Task actual costs</div>
            <div className="text-lg font-semibold text-emerald-950">
              {p.spentFromTasks != null ? eur(p.spentFromTasks) : eur(0)}
            </div>
            <div className="text-[10px] text-emerald-800">Sum of task actuals</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-800">Utilisation</div>
            {p.budget != null && p.budget > 0 ? (
              <>
                <div className="text-lg font-semibold text-emerald-950">
                  {Math.min(
                    100,
                    Math.round(
                      ((Math.max(Number(p.budgetSpent || 0), Number(p.spentFromTasks || 0)) / p.budget) * 1000)
                    ) / 10
                  )}
                  %
                </div>
                <div className="mt-1 h-2 w-full max-w-xs rounded-full bg-emerald-200">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{
                      width: `${Math.min(
                        100,
                        (Math.max(Number(p.budgetSpent || 0), Number(p.spentFromTasks || 0)) / p.budget) * 100
                      )}%`
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="text-sm text-emerald-800">Set a budget to track</div>
            )}
          </div>
        </div>
      </div>

      {p.description ? (
        <div className="rounded-xl ui-surface p-4 text-sm text-slate-700 dark:text-slate-300 print:hidden">
          {p.description}
        </div>
      ) : null}

      <div className="hidden print:block print:space-y-6">
        <PrintStatementHeader
          title="Project report"
          subtitle={`${p.code} · ${p.name}`}
          meta={`Printed ${new Date().toLocaleString()} · ${PROJECT_KIND[p.projectKind] || p.projectKind}`}
        />

        <div className="overflow-hidden rounded-xl border border-slate-200 print:break-inside-avoid">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-white print:bg-slate-800">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" colSpan={2}>
                  Summary
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <td className="w-[32%] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Status
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{PROJECT_STATUS[p.status]}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Priority</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{PRIORITY[p.priority]}</td>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Progress</td>
                <td className="px-4 py-2.5 font-medium tabular-nums text-slate-900">{p.progress ?? 0}%</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Budget</td>
                <td className="px-4 py-2.5 font-medium tabular-nums text-slate-900">
                  {p.budget != null ? `${eur(p.budget)} ${p.budgetCurrency || "EUR"}` : "—"}
                </td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600">Description</td>
                <td className="px-4 py-2.5 whitespace-pre-wrap text-slate-800">{p.description || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Task register</div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800 text-white print:bg-slate-800">
                  <th className="px-3 py-2 text-left font-semibold">Title</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Priority</th>
                  <th className="px-3 py-2 text-left font-semibold">Assignee</th>
                  <th className="px-3 py-2 text-left font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {(p.tasks || []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      No tasks recorded for this project.
                    </td>
                  </tr>
                ) : (
                  (p.tasks || []).map((t, i) => (
                    <tr key={t.id} className={i % 2 === 0 ? "bg-white dark:bg-slate-800/90" : "bg-slate-50/90 dark:bg-slate-800/50"}>
                      <td className="border-t border-slate-200 px-3 py-2 font-medium text-slate-900">{t.title}</td>
                      <td className="border-t border-slate-200 px-3 py-2 text-slate-800">
                        {TASK_STATUS[t.status] || t.status}
                      </td>
                      <td className="border-t border-slate-200 px-3 py-2 text-slate-800">{PRIORITY[t.priority]}</td>
                      <td className="border-t border-slate-200 px-3 py-2 text-slate-800">{t.assignee?.name || "—"}</td>
                      <td className="border-t border-slate-200 px-3 py-2 tabular-nums text-slate-700">
                        {t.dueDate ? fmtDate(t.dueDate) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="print:hidden">
        <div className="text-sm font-semibold text-slate-900">Add task</div>
        <form
          className="mt-2 space-y-3 rounded-xl ui-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!taskForm.title.trim()) return;
            mCreateTask.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Title *</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={taskForm.title}
                onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-slate-700">Description</label>
              <textarea
                className="mt-1 w-full rounded-lg border-slate-300"
                rows={2}
                value={taskForm.description}
                onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Status</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={taskForm.status}
                onChange={(e) => setTaskForm((f) => ({ ...f, status: e.target.value }))}
              >
                {TASK_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Priority</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={taskForm.priority}
                onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {Object.keys(PRIORITY).map((x) => (
                  <option key={x} value={x}>
                    {PRIORITY[x]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Due date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border-slate-300"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Assignee (director)</label>
              <select
                className="mt-1 w-full rounded-lg border-slate-300"
                value={taskForm.assigneeDirectorId}
                onChange={(e) => setTaskForm((f) => ({ ...f, assigneeDirectorId: e.target.value }))}
              >
                <option value="">—</option>
                {directors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.initials})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Est. cost ({p.budgetCurrency || "EUR"})</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                inputMode="decimal"
                value={taskForm.estimatedCost}
                onChange={(e) => setTaskForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Actual cost</label>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                inputMode="decimal"
                value={taskForm.actualCost}
                onChange={(e) => setTaskForm((f) => ({ ...f, actualCost: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={mCreateTask.isPending || qDirs.isLoading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Add task
          </button>
        </form>
      </div>

      <div className="print:hidden">
        <div className="text-sm font-semibold text-slate-900">Task board</div>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniStat label="All tasks" value={taskStats.total} />
          <MiniStat label="Done" value={taskStats.done} />
          <MiniStat label="Overdue" value={taskStats.overdue} />
          <MiniStat label="Blocked" value={taskStats.blocked} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="ui-input px-2 py-1.5"
            placeholder="Search task title or assignee..."
            value={taskQuery}
            onChange={(e) => setTaskQuery(e.target.value)}
          />
          <select className="ui-input px-2 py-1.5" value={taskPriorityFilter} onChange={(e) => setTaskPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            {Object.keys(PRIORITY).map((x) => (
              <option key={x} value={x}>
                {PRIORITY[x]}
              </option>
            ))}
          </select>
          <select className="ui-input px-2 py-1.5" value={taskAssigneeFilter} onChange={(e) => setTaskAssigneeFilter(e.target.value)}>
            <option value="">All assignees</option>
            {directors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
            <input type="checkbox" checked={showOverdueOnly} onChange={(e) => setShowOverdueOnly(e.target.checked)} />
            Overdue only
          </label>
        </div>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {TASK_ORDER.map((col) => (
            <div key={col} className="w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50/80 p-2">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {TASK_STATUS[col]} ({(tasksByStatus[col] || []).length})
              </div>
              <div className="space-y-2">
                {(tasksByStatus[col] || []).map((t) => (
                  <div key={t.id} className="rounded-lg ui-surface p-3">
                    <div className="font-medium text-slate-900">{t.title}</div>
                    {t.description ? (
                      <div className="mt-1 text-xs text-slate-600 line-clamp-2">{t.description}</div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityBadgeClass(t.priority)}`}>
                        {PRIORITY[t.priority]}
                      </span>
                      {t.assignee ? (
                        <DirectorAvatar director={t.assignee} size="xs" className="inline-flex" />
                      ) : null}
                      {t.dueDate ? (
                        <span className="text-[10px] text-slate-500">Due {fmtDate(t.dueDate)}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-600">
                      Est {t.estimatedCost != null ? eur(t.estimatedCost) : "—"} · Act{" "}
                      {t.actualCost != null ? eur(t.actualCost) : "—"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <select
                        className="max-w-[140px] rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        value={t.status}
                        onChange={(e) =>
                          mUpdateTask.mutate({ taskId: t.id, payload: { status: e.target.value } })
                        }
                      >
                        {TASK_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800 hover:bg-rose-100"
                        onClick={() => {
                          if (window.confirm("Remove this task?")) mDeleteTask.mutate(t.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                      <input
                        className="w-20 rounded border border-slate-200 px-1 py-0.5"
                        placeholder="Est"
                        defaultValue={t.estimatedCost ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const n = v === "" ? null : Number(v);
                          if (n != null && Number.isNaN(n)) return;
                          if (n !== (t.estimatedCost ?? null) && String(n) !== String(t.estimatedCost ?? "")) {
                            mUpdateTask.mutate({ taskId: t.id, payload: { estimatedCost: n } });
                          }
                        }}
                      />
                      <input
                        className="w-20 rounded border border-slate-200 px-1 py-0.5"
                        placeholder="Act"
                        defaultValue={t.actualCost ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const n = v === "" ? null : Number(v);
                          if (n != null && Number.isNaN(n)) return;
                          if (n !== (t.actualCost ?? null)) {
                            mUpdateTask.mutate({ taskId: t.id, payload: { actualCost: n } });
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}
