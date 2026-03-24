import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "../hooks/useMe";
import ErrorBanner from "../components/ErrorBanner";
import Loading from "../components/Loading";
import { createMeeting, deleteMeeting, listMeetings, updateMeeting } from "../api/meetings";

const STATUS = ["SCHEDULED", "COMPLETED", "CANCELLED", "DRAFT"];
const MEETING_TYPES = ["Board", "Management", "Project", "Finance", "Operations", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const RECURRENCE = ["NONE", "WEEKLY", "MONTHLY", "QUARTERLY"];

const EMPTY_FORM = {
  title: "",
  date: "",
  time: "",
  location: "",
  chairperson: "",
  attendees: "",
  attendanceCount: "",
  expectedAttendees: "",
  meetingType: "Board",
  priority: "Medium",
  recurrence: "NONE",
  reminderDays: "1",
  agenda: "",
  actionItems: "",
  notes: "",
  nextMeetingDate: "",
  status: "SCHEDULED"
};

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
  const qc = useQueryClient();
  const qMe = useMe(true);
  const q = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const isAdmin = qMe.data?.role === "ADMIN";

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState("");

  const rows = Array.isArray(q.data) ? q.data : [];

  const mCreate = useMutation({
    mutationFn: (payload) => createMeeting(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meetings"] });
    }
  });
  const mUpdate = useMutation({
    mutationFn: ({ id, payload }) => updateMeeting(id, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meetings"] });
    }
  });
  const mDelete = useMutation({
    mutationFn: (id) => deleteMeeting(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["meetings"] });
    }
  });

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (statusFilter === "ALL" ? true : r.status === statusFilter))
      .filter((r) => (typeFilter === "ALL" ? true : (r.meetingType || "Other") === typeFilter))
      .filter((r) => (priorityFilter === "ALL" ? true : (r.priority || "Medium") === priorityFilter))
      .filter((r) => (showUpcomingOnly ? r.date >= new Date().toISOString().slice(0, 10) : true))
      .filter((r) => {
        const hay = `${r.title} ${r.location} ${r.chairperson} ${r.attendees} ${r.meetingType || ""}`.toLowerCase();
        return hay.includes(query.toLowerCase().trim());
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [rows, query, statusFilter, typeFilter, priorityFilter, showUpcomingOnly]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const scheduled = rows.filter((r) => r.status === "SCHEDULED").length;
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const cancelled = rows.filter((r) => r.status === "CANCELLED").length;
    const upcoming = rows.filter((r) => r.status === "SCHEDULED" && r.date >= today).length;
    const highPriority = rows.filter((r) => ["High", "Critical"].includes(r.priority || "")).length;
    return { scheduled, completed, cancelled, total: rows.length, upcoming, highPriority };
  }, [rows]);

  const meetingsByDate = useMemo(() => {
    return rows.reduce((acc, row) => {
      if (!row.date) return acc;
      acc[row.date] = acc[row.date] || [];
      acc[row.date].push(row);
      return acc;
    }, {});
  }, [rows]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const leading = start.getDay();
    const total = end.getDate();
    const cells = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= total; d += 1) {
      const dt = new Date(year, month, d);
      cells.push(dt.toISOString().slice(0, 10));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const selectedDayRows = useMemo(() => {
    if (!selectedDate) return [];
    const dayRows = meetingsByDate[selectedDate] || [];
    return [...dayRows].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  }, [meetingsByDate, selectedDate]);

  const upcomingMeetings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows
      .filter((r) => r.date >= today && r.status !== "CANCELLED")
      .sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`))
      .slice(0, 5);
  }, [rows]);

  if (qMe.isLoading) return <Loading label="Loading meetings..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (q.isLoading) return <Loading label="Loading meetings..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

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
    const payload = {
      ...form,
      attendanceCount: form.attendanceCount === "" ? null : Number(form.attendanceCount),
      expectedAttendees: form.expectedAttendees === "" ? null : Number(form.expectedAttendees),
      reminderDays: form.reminderDays === "" ? null : Number(form.reminderDays)
    };
    if (editingId) mUpdate.mutate({ id: editingId, payload });
    else mCreate.mutate(payload);
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
      attendanceCount: r.attendanceCount || "",
      expectedAttendees: r.expectedAttendees || "",
      meetingType: r.meetingType || "Board",
      priority: r.priority || "Medium",
      recurrence: r.recurrence || "NONE",
      reminderDays: r.reminderDays || "1",
      agenda: r.agenda || "",
      actionItems: r.actionItems || "",
      notes: r.notes || "",
      nextMeetingDate: r.nextMeetingDate || "",
      status: r.status || "SCHEDULED"
    });
  }

  function onDelete(id) {
    if (!isAdmin) return;
    mDelete.mutate(id);
    if (editingId === id) resetForm();
  }

  function goMonth(delta) {
    setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  function jumpToToday() {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(dateKey);
  }

  function setMeetingStatus(id, status) {
    if (!isAdmin) return;
    mUpdate.mutate({ id, payload: { status } });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Meetings</div>
        <div className="text-sm ui-body-text">
          Schedule governance meetings, track attendance, keep minutes, and follow up action items.
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Scheduled" value={stats.scheduled} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Cancelled" value={stats.cancelled} />
        <StatCard label="Upcoming" value={stats.upcoming} />
        <StatCard label="High priority" value={stats.highPriority} />
      </section>

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold ui-page-heading">Meeting calendar</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Click a day to view meetings. Days with meetings show a badge.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => goMonth(-1)}>
              Previous
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={jumpToToday}>
              Today
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => goMonth(1)}>
              Next
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
          {calendarMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dateKey, idx) => {
            if (!dateKey) return <div key={`empty-${idx}`} className="h-20 rounded-lg border border-transparent" />;
            const dayNum = Number(dateKey.slice(-2));
            const count = (meetingsByDate[dateKey] || []).length;
            const isSelected = selectedDate === dateKey;
            const isToday = dateKey === new Date().toISOString().slice(0, 10);
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setSelectedDate(dateKey)}
                className={[
                  "h-20 rounded-lg border p-2 text-left transition-colors",
                  isSelected
                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/30"
                    : "border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:border-brand-500/50 dark:hover:bg-slate-800/80"
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className={isToday ? "rounded bg-accent-100 px-1.5 py-0.5 text-[11px] font-semibold text-accent-900 dark:bg-accent-900/40 dark:text-accent-100" : "text-xs text-slate-700 dark:text-slate-300"}>
                    {dayNum}
                  </span>
                  {count > 0 ? (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{count}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Selected day</div>
            <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{selectedDate || "No day selected"}</div>
            <div className="mt-2 space-y-2">
              {!selectedDate && <div className="text-sm text-slate-500 dark:text-slate-400">Select a date from the calendar.</div>}
              {!!selectedDate && !selectedDayRows.length && (
                <div className="text-sm text-slate-500 dark:text-slate-400">No meetings for this day.</div>
              )}
              {selectedDayRows.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.time || "No time"} · {r.location || "No location"} · {r.status}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Upcoming meetings</div>
            <div className="mt-2 space-y-2">
              {!upcomingMeetings.length && <div className="text-sm text-slate-500 dark:text-slate-400">No upcoming meetings.</div>}
              {upcomingMeetings.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setCalendarMonth(new Date(`${r.date}T00:00:00`));
                    setSelectedDate(r.date);
                  }}
                  className="w-full rounded-lg border border-slate-200 p-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:border-brand-500/50 dark:hover:bg-slate-800/80"
                >
                  <div className="font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.date} {r.time ? `· ${r.time}` : ""} · {r.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
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
            label="Attendance count"
            type="number"
            value={form.attendanceCount}
            onChange={(v) => onChange("attendanceCount", v)}
          />
          <LabeledInput
            label="Expected attendees"
            type="number"
            value={form.expectedAttendees}
            onChange={(v) => onChange("expectedAttendees", v)}
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Meeting type
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={form.meetingType}
              onChange={(e) => onChange("meetingType", e.target.value)}
            >
              {MEETING_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Priority
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={form.priority}
              onChange={(e) => onChange("priority", e.target.value)}
            >
              {PRIORITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recurrence
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={form.recurrence}
              onChange={(e) => onChange("recurrence", e.target.value)}
            >
              {RECURRENCE.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput
            label="Reminder days before"
            type="number"
            value={form.reminderDays}
            onChange={(v) => onChange("reminderDays", v)}
          />
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
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All types</option>
              {MEETING_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="ALL">All priorities</option>
              {PRIORITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <input type="checkbox" checked={showUpcomingOnly} onChange={(e) => setShowUpcomingOnly(e.target.checked)} />
              Upcoming only
            </label>
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
                <th className="px-3 py-2">Type / Priority</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attendance</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    <div>{r.meetingType || "Other"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.priority || "Medium"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {r.attendanceCount || "—"} / {r.expectedAttendees || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.chairperson || "—"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.location || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ui-btn-outline-xs" onClick={() => onEdit(r)} disabled={!isAdmin}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ui-btn-outline-xs"
                        onClick={() => setMeetingStatus(r.id, "COMPLETED")}
                        disabled={!isAdmin}
                      >
                        Mark completed
                      </button>
                      <button
                        type="button"
                        className="ui-btn-outline-xs"
                        onClick={() => setMeetingStatus(r.id, "CANCELLED")}
                        disabled={!isAdmin}
                      >
                        Cancel
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
                  <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={8}>
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
