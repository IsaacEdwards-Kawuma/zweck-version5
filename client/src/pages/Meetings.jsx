import { useMemo, useState } from "react";
import { useMe } from "../hooks/useMe";
import ErrorBanner from "../components/ErrorBanner";
import Loading from "../components/Loading";

const STORAGE_KEY = "zweck_meetings_v1";

const STATUS = ["SCHEDULED", "COMPLETED", "CANCELLED", "DRAFT"];

const EMPTY_FORM = {
  title: "",
  date: "",
  time: "",
  location: "",
  chairperson: "",
  attendees: "",
  agenda: "",
  actionItems: "",
  notes: "",
  nextMeetingDate: "",
  status: "SCHEDULED"
};

function loadMeetings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMeetings(rows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function toCsv(rows) {
  const headers = [
    "title",
    "date",
    "time",
    "location",
    "chairperson",
    "attendees",
    "agenda",
    "actionItems",
    "notes",
    "nextMeetingDate",
    "status",
    "createdAt"
  ];
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => esc(r[h]))
        .join(",")
    )
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meetings.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Meetings() {
  const qMe = useMe(true);
  const isAdmin = qMe.data?.role === "ADMIN";

  const [rows, setRows] = useState(() => loadMeetings());
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (statusFilter === "ALL" ? true : r.status === statusFilter))
      .filter((r) => {
        const hay = `${r.title} ${r.location} ${r.chairperson} ${r.attendees}`.toLowerCase();
        return hay.includes(query.toLowerCase().trim());
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [rows, query, statusFilter]);

  const stats = useMemo(() => {
    const scheduled = rows.filter((r) => r.status === "SCHEDULED").length;
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
    return { scheduled, completed, cancelled, total: rows.length };
  }, [rows]);

  if (qMe.isLoading) return <Loading label="Loading meetings..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;

  function onChange(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!form.title.trim() || !form.date) return;
    const now = new Date().toISOString();

    const next = editingId
      ? rows.map((r) => (r.id === editingId ? { ...r, ...form, updatedAt: now } : r))
      : [
          {
            id: crypto.randomUUID(),
            ...form,
            createdAt: now,
            updatedAt: now
          },
          ...rows
        ];
    setRows(next);
    saveMeetings(next);
    resetForm();
  }

  function onEdit(r) {
    if (!isAdmin) return;
    setEditingId(r.id);
    setForm({
      title: r.title || "",
      date: r.date || "",
      time: r.time || "",
      location: r.location || "",
      chairperson: r.chairperson || "",
      attendees: r.attendees || "",
      agenda: r.agenda || "",
      actionItems: r.actionItems || "",
      notes: r.notes || "",
      nextMeetingDate: r.nextMeetingDate || "",
      status: r.status || "SCHEDULED"
    });
  }

  function onDelete(id) {
    if (!isAdmin) return;
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    saveMeetings(next);
    if (editingId === id) resetForm();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Meetings</div>
        <div className="text-sm ui-body-text">
          Schedule governance meetings, track attendance, keep minutes, and follow up action items.
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Scheduled" value={stats.scheduled} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Cancelled" value={stats.cancelled} />
      </section>

      {!isAdmin ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          You are in read-only mode. Only admins can add, update, or delete meetings.
        </div>
      ) : null}

      <section className="ui-surface rounded-2xl p-4">
        <div className="text-sm font-semibold ui-page-heading">{editingId ? "Edit meeting" : "New meeting"}</div>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <LabeledInput label="Meeting title" value={form.title} onChange={(v) => onChange("title", v)} required />
          <LabeledInput label="Date" type="date" value={form.date} onChange={(v) => onChange("date", v)} required />
          <LabeledInput label="Time" type="time" value={form.time} onChange={(v) => onChange("time", v)} />
          <LabeledInput label="Location" value={form.location} onChange={(v) => onChange("location", v)} />
          <LabeledInput label="Chairperson" value={form.chairperson} onChange={(v) => onChange("chairperson", v)} />
          <LabeledInput label="Attendees" value={form.attendees} onChange={(v) => onChange("attendees", v)} />
          <LabeledInput
            label="Next meeting date"
            type="date"
            value={form.nextMeetingDate}
            onChange={(v) => onChange("nextMeetingDate", v)}
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Status
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={form.status}
              onChange={(e) => onChange("status", e.target.value)}
              disabled={!isAdmin}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <LabeledTextArea
            label="Agenda"
            value={form.agenda}
            onChange={(v) => onChange("agenda", v)}
            className="md:col-span-2"
          />
          <LabeledTextArea
            label="Action items"
            value={form.actionItems}
            onChange={(v) => onChange("actionItems", v)}
            className="md:col-span-2"
          />
          <LabeledTextArea label="Minutes / notes" value={form.notes} onChange={(v) => onChange("notes", v)} className="md:col-span-2" />
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button type="submit" className="ui-btn-primary" disabled={!isAdmin}>
              {editingId ? "Update meeting" : "Save meeting"}
            </button>
            <button type="button" className="ui-btn-outline" onClick={resetForm}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Meeting register</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Search title, chairperson, location..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className="ui-btn-outline" onClick={() => toCsv(filtered)}>
              Export CSV
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Chairperson</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
                    {!!r.agenda && <div className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{r.agenda}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {r.date} {r.time ? `· ${r.time}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.chairperson || "—"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.location || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button type="button" className="ui-btn-outline-xs" onClick={() => onEdit(r)} disabled={!isAdmin}>
                        Edit
                      </button>
                      <button type="button" className="ui-btn-outline-xs" onClick={() => onDelete(r.id)} disabled={!isAdmin}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={6}>
                    No meetings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="ui-surface rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {label}
      <input
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function LabeledTextArea({ label, value, onChange, className = "" }) {
  return (
    <label className={`text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${className}`}>
      {label}
      <textarea
        className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
