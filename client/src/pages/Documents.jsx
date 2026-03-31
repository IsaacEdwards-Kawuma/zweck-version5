import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "../hooks/useMe";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { createDocument, deleteDocument, listDocuments, updateDocument } from "../api/documents";
import { hasAdminPrivileges } from "../lib/roles";

const CATEGORIES = ["Governance", "Legal", "Finance", "HR", "Operations", "Other"];
const STATUS = ["ACTIVE", "UNDER_REVIEW", "ARCHIVED"];

const EMPTY_FORM = {
  title: "",
  category: "Governance",
  reference: "",
  owner: "",
  confidentiality: "Internal",
  status: "ACTIVE",
  version: "1.0",
  tags: "",
  effectiveDate: "",
  reviewDate: "",
  expiryDate: "",
  pinned: false,
  url: "",
  notes: ""
};

export default function Documents() {
  const qc = useQueryClient();
  const qMe = useMe(true);
  const q = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const isAdmin = hasAdminPrivileges(qMe.data?.role);

  const [form, setForm] = useState(EMPTY_FORM);
  const rows = useMemo(() => (Array.isArray(q.data) ? q.data : []), [q.data]);
  const mCreate = useMutation({
    mutationFn: (payload) => createDocument(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["documents"] });
    }
  });
  const mUpdate = useMutation({
    mutationFn: ({ id, payload }) => updateDocument(id, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["documents"] });
    }
  });
  const mDelete = useMutation({
    mutationFn: (id) => deleteDocument(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["documents"] });
    }
  });

  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [confidentialityFilter, setConfidentialityFilter] = useState("ALL");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState("UPDATED_DESC");

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let out = rows
      .filter((r) => (categoryFilter === "ALL" ? true : r.category === categoryFilter))
      .filter((r) => (statusFilter === "ALL" ? true : r.status === statusFilter))
      .filter((r) => (confidentialityFilter === "ALL" ? true : r.confidentiality === confidentialityFilter))
      .filter((r) => (showOverdueOnly ? Boolean(r.reviewDate && r.reviewDate < today && r.status !== "ARCHIVED") : true))
      .filter((r) => {
        const hay = `${r.title} ${r.reference} ${r.owner} ${r.notes} ${r.tags || ""}`.toLowerCase();
        return hay.includes(query.toLowerCase().trim());
      });

    if (sortBy === "UPDATED_DESC") {
      out = out.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    } else if (sortBy === "TITLE_ASC") {
      out = out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    } else if (sortBy === "REVIEW_ASC") {
      out = out.sort((a, b) => String(a.reviewDate || "9999-12-31").localeCompare(String(b.reviewDate || "9999-12-31")));
    } else if (sortBy === "EXPIRY_ASC") {
      out = out.sort((a, b) => String(a.expiryDate || "9999-12-31").localeCompare(String(b.expiryDate || "9999-12-31")));
    }

    return [...out].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  }, [rows, query, categoryFilter, statusFilter, confidentialityFilter, showOverdueOnly, sortBy]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = rows.filter((r) => r.status === "ACTIVE").length;
    const review = rows.filter((r) => r.status === "UNDER_REVIEW").length;
    const archived = rows.filter((r) => r.status === "ARCHIVED").length;
    const overdue = rows.filter((r) => r.reviewDate && r.reviewDate < today && r.status !== "ARCHIVED").length;
    const expiringSoon = rows.filter((r) => r.expiryDate && daysUntil(r.expiryDate) <= 30 && daysUntil(r.expiryDate) >= 0).length;
    return { total: rows.length, active, review, archived, overdue, expiringSoon };
  }, [rows]);

  if (qMe.isLoading) return <Loading label="Loading documents..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (q.isLoading) return <Loading label="Loading documents..." />;
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
    if (!form.title.trim()) return;
    if (editingId) mUpdate.mutate({ id: editingId, payload: form });
    else mCreate.mutate(form);
    resetForm();
  }

  function onEdit(r) {
    if (!isAdmin) return;
    setEditingId(r.id);
    setForm({
      title: r.title || "",
      category: r.category || "Governance",
      reference: r.reference || "",
      owner: r.owner || "",
      confidentiality: r.confidentiality || "Internal",
      status: r.status || "ACTIVE",
      version: r.version || "1.0",
      tags: r.tags || "",
      effectiveDate: r.effectiveDate || "",
      reviewDate: r.reviewDate || "",
      expiryDate: r.expiryDate || "",
      pinned: Boolean(r.pinned),
      url: r.url || "",
      notes: r.notes || ""
    });
  }

  function onDelete(id) {
    if (!isAdmin) return;
    mDelete.mutate(id);
    if (editingId === id) resetForm();
  }

  function exportCsv() {
    const headers = [
      "title",
      "category",
      "reference",
      "owner",
      "confidentiality",
      "status",
      "version",
      "tags",
      "effectiveDate",
      "reviewDate",
      "expiryDate",
      "pinned",
      "url",
      "notes",
      "createdAt"
    ];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const content = [
      headers.join(","),
      ...filtered.map((r) =>
        headers
          .map((h) => esc(r[h]))
          .join(",")
      )
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document-register.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function togglePin(id) {
    if (!isAdmin) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    mUpdate.mutate({ id, payload: { pinned: !row.pinned } });
  }

  function markReviewed(id) {
    if (!isAdmin) return;
    const today = new Date().toISOString().slice(0, 10);
    mUpdate.mutate({ id, payload: { reviewDate: today, status: "ACTIVE" } });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Documents</div>
        <div className="text-sm ui-body-text">
          Keep a clean document register with ownership, review cycles, confidentiality, and quick links.
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Under review" value={stats.review} />
        <StatCard label="Archived" value={stats.archived} />
        <StatCard label="Overdue review" value={stats.overdue} />
        <StatCard label="Expiring (30d)" value={stats.expiringSoon} />
      </section>

      {!isAdmin ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          You are in read-only mode. Only admins can maintain the document register.
        </div>
      ) : null}

      <section className="ui-surface rounded-2xl p-4">
        <div className="text-sm font-semibold ui-page-heading">{editingId ? "Edit document" : "New document"}</div>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <LabeledInput label="Title" value={form.title} onChange={(v) => onChange("title", v)} required />
          <LabeledInput label="Reference code" value={form.reference} onChange={(v) => onChange("reference", v)} />
          <LabeledInput label="Owner" value={form.owner} onChange={(v) => onChange("owner", v)} />
          <LabeledInput label="Version" value={form.version} onChange={(v) => onChange("version", v)} />
          <LabeledInput label="Tags (comma separated)" value={form.tags} onChange={(v) => onChange("tags", v)} />
          <LabeledInput label="Effective date" type="date" value={form.effectiveDate} onChange={(v) => onChange("effectiveDate", v)} />
          <LabeledInput label="Review date" type="date" value={form.reviewDate} onChange={(v) => onChange("reviewDate", v)} />
          <LabeledInput label="Expiry date" type="date" value={form.expiryDate} onChange={(v) => onChange("expiryDate", v)} />
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Category
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={form.category}
              onChange={(e) => onChange("category", e.target.value)}
            >
              {CATEGORIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Status
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={form.status}
              onChange={(e) => onChange("status", e.target.value)}
            >
              {STATUS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="Confidentiality" value={form.confidentiality} onChange={(v) => onChange("confidentiality", v)} />
          <LabeledInput label="Document URL" value={form.url} onChange={(v) => onChange("url", v)} />
          <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={form.pinned} onChange={(e) => onChange("pinned", e.target.checked)} />
            Pin document on top
          </label>
          <LabeledTextArea label="Notes" value={form.notes} onChange={(v) => onChange("notes", v)} className="md:col-span-2" />
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button type="submit" className="ui-btn-primary" disabled={!isAdmin}>
              {editingId ? "Update document" : "Save document"}
            </button>
            <button type="button" className="ui-btn-outline" onClick={resetForm}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="ui-surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Document register</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Search title, owner, reference..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All categories</option>
              {CATEGORIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              {STATUS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={confidentialityFilter}
              onChange={(e) => setConfidentialityFilter(e.target.value)}
            >
              <option value="ALL">All confidentiality</option>
              {["Internal", "Confidential", "Restricted", "Public"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="UPDATED_DESC">Sort: Recently updated</option>
              <option value="TITLE_ASC">Sort: Title (A-Z)</option>
              <option value="REVIEW_ASC">Sort: Review date</option>
              <option value="EXPIRY_ASC">Sort: Expiry date</option>
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              <input type="checkbox" checked={showOverdueOnly} onChange={(e) => setShowOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
            <button type="button" className="ui-btn-outline" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Version / tags</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Timeline</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {r.reference || "—"} {r.pinned ? "· Pinned" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.category}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.owner || "—"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    <div>v{r.version || "1.0"}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {parseTags(r.tags).slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    <div>Review: {r.reviewDate || "—"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Expiry: {r.expiryDate || "—"}</div>
                    {isOverdue(r) && <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">Overdue review</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.url ? (
                        <a className="ui-btn-outline-xs" href={r.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : null}
                      <button type="button" className="ui-btn-outline-xs" onClick={() => onEdit(r)} disabled={!isAdmin}>
                        Edit
                      </button>
                      <button type="button" className="ui-btn-outline-xs" onClick={() => markReviewed(r.id)} disabled={!isAdmin}>
                        Mark reviewed
                      </button>
                      <button type="button" className="ui-btn-outline-xs" onClick={() => togglePin(r.id)} disabled={!isAdmin}>
                        {r.pinned ? "Unpin" : "Pin"}
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
                  <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={7}>
                    No documents found.
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

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const diff = target.getTime() - today.getTime();
  return Math.floor(diff / 86400000);
}

function isOverdue(row) {
  if (!row?.reviewDate || row.status === "ARCHIVED") return false;
  return row.reviewDate < new Date().toISOString().slice(0, 10);
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
