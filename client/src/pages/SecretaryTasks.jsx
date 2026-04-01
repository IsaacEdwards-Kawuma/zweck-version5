import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageHero from "../components/PageHero";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { IconClipboard } from "../components/Icons";
import {
  createSecretaryWorkflowTask,
  deleteSecretaryWorkflowTask,
  listSecretaryAssignees,
  listSecretaryWorkflowTasks,
  moveSecretaryWorkflowTask,
  patchSecretaryWorkflowTask
} from "../api/secretaryWorkflowTasks";

const COLUMNS = [
  { status: "TODO", label: "To Do", tone: "slate" },
  { status: "IN_PROGRESS", label: "In progress", tone: "sky" },
  { status: "IN_REVIEW", label: "Review", tone: "amber" },
  { status: "DONE", label: "Done", tone: "emerald" },
  { status: "BLOCKED", label: "Blocked", tone: "rose" }
];

const PRI_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const REC_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" }
];

function priorityClass(p) {
  switch (p) {
    case "CRITICAL":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100";
    case "HIGH":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
    case "LOW":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    default:
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100";
  }
}

function fmtDue(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

function emptyForm() {
  return {
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: "",
    assigneeUserId: "",
    dependsOnTaskId: "",
    approvalStatus: "NOT_REQUIRED",
    approverUserId: "",
    recurrence: "NONE",
    recurrenceUntil: ""
  };
}

function taskToForm(t) {
  return {
    title: t.title ?? "",
    description: t.description ?? "",
    status: t.status ?? "TODO",
    priority: t.priority ?? "MEDIUM",
    dueDate: t.dueDate ? String(t.dueDate).slice(0, 16) : "",
    assigneeUserId: t.assigneeUserId != null ? String(t.assigneeUserId) : "",
    dependsOnTaskId: t.dependsOnTaskId != null ? String(t.dependsOnTaskId) : "",
    approvalStatus: t.approvalStatus ?? "NOT_REQUIRED",
    approverUserId: t.approverUserId != null ? String(t.approverUserId) : "",
    recurrence: t.recurrence ?? "NONE",
    recurrenceUntil: t.recurrenceUntil ? String(t.recurrenceUntil).slice(0, 16) : ""
  };
}

export default function SecretaryTasks() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm());
  const [dragTaskId, setDragTaskId] = useState(null);

  const qTasks = useQuery({ queryKey: ["secretary-workflow-tasks"], queryFn: listSecretaryWorkflowTasks });
  const qAssignees = useQuery({ queryKey: ["secretary-workflow-assignees"], queryFn: listSecretaryAssignees });

  const tasks = qTasks.data ?? [];
  const assignees = qAssignees.data ?? [];

  const byStatus = useMemo(() => {
    const m = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [], BLOCKED: [] };
    for (const t of tasks) {
      if (m[t.status]) m[t.status].push(t);
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => (a.columnOrder ?? 0) - (b.columnOrder ?? 0) || a.id - b.id);
    }
    return m;
  }, [tasks]);

  const dependencyOptions = useMemo(() => tasks.filter((t) => t.id !== editingId), [tasks, editingId]);

  const mCreate = useMutation({
    mutationFn: createSecretaryWorkflowTask,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["secretary-workflow-tasks"] });
      closeModal();
    }
  });
  const mPatch = useMutation({
    mutationFn: ({ id, payload }) => patchSecretaryWorkflowTask(id, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["secretary-workflow-tasks"] });
      closeModal();
    }
  });
  const mMove = useMutation({
    mutationFn: ({ id, status }) => moveSecretaryWorkflowTask(id, status),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["secretary-workflow-tasks"] })
  });
  const mDelete = useMutation({
    mutationFn: deleteSecretaryWorkflowTask,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["secretary-workflow-tasks"] })
  });

  function closeModal() {
    setModal(null);
    setEditingId(null);
    setForm(emptyForm());
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setModal("edit");
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm(taskToForm(t));
    setModal("edit");
  }

  function payloadFromForm() {
    const due = form.dueDate ? new Date(form.dueDate).toISOString() : null;
    const recUntil = form.recurrenceUntil ? new Date(form.recurrenceUntil).toISOString() : null;
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      dueDate: due,
      assigneeUserId: form.assigneeUserId === "" ? null : Number(form.assigneeUserId),
      dependsOnTaskId: form.dependsOnTaskId === "" ? null : Number(form.dependsOnTaskId),
      approvalStatus: form.approvalStatus,
      approverUserId:
        form.approvalStatus === "PENDING" ? (form.approverUserId === "" ? null : Number(form.approverUserId)) : null,
      recurrence: form.recurrence,
      recurrenceUntil: form.recurrence !== "NONE" ? recUntil : null
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const p = payloadFromForm();
    if (!p.title) return;
    if (p.approvalStatus === "PENDING" && !p.approverUserId) return;
    if (editingId) mPatch.mutate({ id: editingId, payload: p });
    else mCreate.mutate(p);
  }

  function onDragStart(e, task) {
    setDragTaskId(task.id);
    e.dataTransfer.setData("text/task-id", String(task.id));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOverCol(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDropCol(e, status) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/task-id") || dragTaskId);
    setDragTaskId(null);
    if (!Number.isFinite(id)) return;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    mMove.mutate({ id, status });
  }

  const busy = mCreate.isPending || mPatch.isPending;

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconClipboard}
        title="Tasks & workflows"
        subtitle="Secretary-only board: assign work to team members, track approvals, dependencies, due dates, and recurrence."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Drag cards between columns to update status. Edit a card for priority, dependency, recurring pattern, and manager approval.
        </p>
        <button type="button" className="ui-btn" onClick={openCreate}>
          New task
        </button>
      </div>

      {qTasks.isLoading ? <Loading label="Loading tasks…" /> : null}
      {qTasks.isError ? <ErrorBanner error={qTasks.error} /> : null}

      {!qTasks.isLoading && !qTasks.isError ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="flex min-h-[280px] flex-col rounded-2xl border border-slate-200/80 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40"
              onDragOver={onDragOverCol}
              onDrop={(e) => onDropCol(e, col.status)}
            >
              <div
                className={[
                  "border-b px-3 py-2 text-xs font-bold uppercase tracking-wide",
                  col.tone === "slate" && "border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300",
                  col.tone === "sky" && "border-sky-200 text-sky-800 dark:border-sky-800 dark:text-sky-200",
                  col.tone === "amber" && "border-amber-200 text-amber-900 dark:border-amber-800 dark:text-amber-100",
                  col.tone === "emerald" && "border-emerald-200 text-emerald-900 dark:border-emerald-800 dark:text-emerald-100",
                  col.tone === "rose" && "border-rose-200 text-rose-900 dark:border-rose-800 dark:text-rose-100"
                ].filter(Boolean).join(" ")}
              >
                {col.label}
                <span className="ml-1 font-mono text-[10px] opacity-70">({byStatus[col.status]?.length ?? 0})</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {(byStatus[col.status] ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, t)}
                    onClick={() => openEdit(t)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow dark:border-slate-600 dark:bg-slate-950/80"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{t.title}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${priorityClass(t.priority)}`}>
                        {t.priority}
                      </span>
                    </div>
                    {t.assignee ? (
                      <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{t.assignee.email}</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {fmtDue(t.dueDate) ? <span>Due {fmtDue(t.dueDate)}</span> : null}
                      {t.dependsOn ? (
                        <span className="rounded bg-slate-100 px-1 dark:bg-slate-800">Depends on #{t.dependsOn.id}</span>
                      ) : null}
                      {t.approvalStatus === "PENDING" ? (
                        <span className="rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">Approval</span>
                      ) : null}
                      {t.recurrence && t.recurrence !== "NONE" ? (
                        <span className="rounded bg-violet-100 px-1 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100">
                          {t.recurrence.toLowerCase()}
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {modal === "edit" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{editingId ? "Edit task" : "New task"}</h2>
            <form className="mt-4 space-y-3" onSubmit={onSubmit}>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Title</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  maxLength={300}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Description</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.status} value={c.status}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Priority</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {PRI_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Due date</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Assign to (employee)</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={form.assigneeUserId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeUserId: e.target.value }))}
                >
                  <option value="">— Unassigned —</option>
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({u.role})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Depends on task</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  value={form.dependsOnTaskId}
                  onChange={(e) => setForm((f) => ({ ...f, dependsOnTaskId: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {dependencyOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} {t.title.slice(0, 48)}
                      {t.title.length > 48 ? "…" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Approval</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={form.approvalStatus}
                    onChange={(e) => setForm((f) => ({ ...f, approvalStatus: e.target.value }))}
                  >
                    <option value="NOT_REQUIRED">Not required</option>
                    <option value="PENDING">Pending manager</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Approver (manager)</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={form.approverUserId}
                    onChange={(e) => setForm((f) => ({ ...f, approverUserId: e.target.value }))}
                    disabled={form.approvalStatus !== "PENDING"}
                  >
                    <option value="">— Select —</option>
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Recurrence</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={form.recurrence}
                    onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
                  >
                    {REC_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Repeat until</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    value={form.recurrenceUntil}
                    onChange={(e) => setForm((f) => ({ ...f, recurrenceUntil: e.target.value }))}
                    disabled={form.recurrence === "NONE"}
                  />
                </label>
              </div>
              {mCreate.error || mPatch.error ? (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                  {(mCreate.error || mPatch.error)?.message || "Could not save"}
                </div>
              ) : null}
              <div className="flex flex-wrap justify-between gap-2 pt-2">
                {editingId ? (
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
                    onClick={() => {
                      if (!window.confirm("Delete this task?")) return;
                      mDelete.mutate(editingId, {
                        onSuccess: async () => {
                          await qc.invalidateQueries({ queryKey: ["secretary-workflow-tasks"] });
                          closeModal();
                        }
                      });
                    }}
                  >
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button type="button" className="ui-btn-outline" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="ui-btn" disabled={busy}>
                    {editingId ? "Save" : "Create"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
