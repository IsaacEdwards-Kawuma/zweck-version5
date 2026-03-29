import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "../hooks/useMe";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import PageHero, { SectionTitle } from "../components/PageHero";
import { IconClipboard } from "../components/Icons";
import { formatMoney } from "../lib/format";
import {
  cancelInternalForm,
  createInternalForm,
  decideInternalForm,
  listInternalForms
} from "../api/internalForms";
import { downloadApprovedForm, printApprovedForm } from "../lib/internalFormDocument";

const KINDS = [
  { value: "REQUISITION", label: "Requisition (spend / procurement)" },
  { value: "GENERAL_REQUEST", label: "General internal request" }
];

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const CURRENCIES = ["UGX", "USD", "EUR"];

const EMPTY = {
  kind: "REQUISITION",
  title: "",
  description: "",
  amount: "",
  currency: "UGX",
  purpose: "",
  vendor: ""
};

function kindLabel(k) {
  if (k === "REQUISITION") return "Requisition";
  if (k === "GENERAL_REQUEST") return "General";
  return k;
}

function statusBadgeClass(s) {
  switch (s) {
    case "PENDING":
      return "bg-amber-100 text-amber-900 ring-amber-200/80 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800/60";
    case "APPROVED":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800/60";
    case "REJECTED":
      return "bg-rose-100 text-rose-900 ring-rose-200/80 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800/60";
    case "CANCELLED":
      return "bg-slate-100 text-slate-700 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/60";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function requesterName(row) {
  const d = row.requestedBy?.director?.name;
  if (d) return d;
  if (row.requestedBy?.email) return row.requestedBy.email;
  return `User #${row.requestedById}`;
}

export default function Forms() {
  const qc = useQueryClient();
  const qMe = useMe(true);
  const role = qMe.data?.role;
  const canReview = role === "ADMIN" || role === "TREASURER";
  const canSeeAll =
    canReview || role === "SECRETARY" || role === "OPERATIONAL_MANAGER" || role === "CEO";

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [decision, setDecision] = useState(null);

  const listParams = useMemo(() => {
    const p = {};
    if (statusFilter !== "ALL") p.status = statusFilter;
    if (kindFilter !== "ALL") p.kind = kindFilter;
    if (canSeeAll && mineOnly) p.mine = true;
    return p;
  }, [statusFilter, kindFilter, canSeeAll, mineOnly]);

  const q = useQuery({
    queryKey: ["internal-forms", listParams],
    queryFn: () => listInternalForms(listParams),
    enabled: !qMe.isLoading && !qMe.error
  });

  const mCreate = useMutation({
    mutationFn: (payload) => createInternalForm(payload),
    onSuccess: async () => {
      setForm(EMPTY);
      await qc.invalidateQueries({ queryKey: ["internal-forms"] });
    }
  });

  const mDecide = useMutation({
    mutationFn: ({ id, status, reviewNote }) => decideInternalForm(id, { status, reviewNote: reviewNote || null }),
    onSuccess: async () => {
      setDecision(null);
      await qc.invalidateQueries({ queryKey: ["internal-forms"] });
    }
  });

  const mCancel = useMutation({
    mutationFn: (id) => cancelInternalForm(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["internal-forms"] });
    }
  });

  if (qMe.isLoading) return <Loading label="Loading forms..." />;
  if (qMe.error) return <ErrorBanner error={qMe.error} />;
  if (q.isLoading) return <Loading label="Loading requests..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const rows = Array.isArray(q.data) ? q.data : [];

  function submitCreate(e) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    const amountRaw = String(form.amount).trim();
    let amount = null;
    if (amountRaw !== "") {
      const n = Number(amountRaw);
      if (!Number.isFinite(n) || n < 0) return;
      amount = n;
    }
    mCreate.mutate({
      kind: form.kind,
      title,
      description: form.description.trim() || null,
      amount,
      currency: amount != null ? form.currency : null,
      purpose: form.purpose.trim() || null,
      vendor: form.vendor.trim() || null
    });
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconClipboard}
        title="Internal forms"
        subtitle="Submit requisitions and general requests. The treasurer (or an admin if none is set) approves or rejects spend. CEO, secretary, and operational manager can see the full queue; only treasurer or admin can approve."
      />

      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/60">
        <SectionTitle>New request</SectionTitle>
        <form className="mt-4 grid gap-4" onSubmit={submitCreate}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Type
              <select
                className="ui-input mt-1 w-full"
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Title <span className="text-rose-600">*</span>
              <input
                className="ui-input mt-1 w-full"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Short summary"
                maxLength={300}
                required
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Details
            <textarea
              className="ui-input mt-1 min-h-[88px] w-full resize-y"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Context, timeline, links…"
              maxLength={8000}
            />
          </label>
          {form.kind === "REQUISITION" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Amount (optional)
                <input
                  className="ui-input mt-1 w-full"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Currency
                <select
                  className="ui-input mt-1 w-full"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Vendor / payee
                <input
                  className="ui-input mt-1 w-full"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                  placeholder="Who would be paid"
                  maxLength={200}
                />
              </label>
              <label className="sm:col-span-2 lg:col-span-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Purpose / budget line
                <input
                  className="ui-input mt-1 w-full"
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  maxLength={500}
                />
              </label>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60" disabled={mCreate.isPending}>
              {mCreate.isPending ? "Submitting…" : "Submit request"}
            </button>
            {mCreate.error ? (
              <span className="text-sm text-rose-600 dark:text-rose-400">{String(mCreate.error?.message || mCreate.error)}</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle>Queue</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <select className="ui-input text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="ui-input text-sm" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="ALL">All types</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {canSeeAll ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="rounded border-slate-300" />
                My requests only
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/70">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Requester</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {rows.map((row) => {
                const isMine = row.requestedById === qMe.data?.id;
                const pending = row.status === "PENDING";
                return (
                  <tr key={row.id} className="text-slate-800 dark:text-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap">{kindLabel(row.kind)}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-[min(28rem,55vw)] font-medium">{row.title}</div>
                      {row.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{row.description}</div>
                      ) : null}
                      {row.kind === "REQUISITION" && (row.purpose || row.vendor) ? (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {[row.purpose, row.vendor].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{requesterName(row)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.amount != null && row.currency ? formatMoney(row.amount, row.currency) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${statusBadgeClass(row.status)}`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {canReview && pending ? (
                          <>
                            <button
                              type="button"
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                              onClick={() => setDecision({ id: row.id, status: "APPROVED", title: row.title })}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                              onClick={() => setDecision({ id: row.id, status: "REJECTED", title: row.title })}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {approved ? (
                          <>
                            <button
                              type="button"
                              className="rounded-lg border border-emerald-600/80 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
                              onClick={() => printApprovedForm(row)}
                            >
                              Print
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              onClick={() => downloadApprovedForm(row)}
                            >
                              Download
                            </button>
                          </>
                        ) : null}
                        {isMine && pending ? (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            disabled={mCancel.isPending}
                            onClick={() => {
                              if (window.confirm("Cancel this pending request?")) mCancel.mutate(row.id);
                            }}
                          >
                            Cancel
                          </button>
                        ) : null}
                        {!pending && row.reviewNote ? (
                          <span className="block w-full pt-1 text-left text-xs text-slate-500 dark:text-slate-400" title={row.reviewNote}>
                            Note: {row.reviewNote}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500 dark:text-slate-400" colSpan={7}>
                    No requests match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {(mDecide.error || mCancel.error) && (
          <div className="mt-3">
            <ErrorBanner error={mDecide.error || mCancel.error} />
          </div>
        )}
      </section>

      {decision ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="decision-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <h2 id="decision-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {decision.status === "APPROVED" ? "Approve" : "Reject"} request
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{decision.title}</p>
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Note to requester (optional)
              <textarea
                className="ui-input mt-1 min-h-[80px] w-full"
                value={decision.note || ""}
                onChange={(e) => setDecision((d) => (d ? { ...d, note: e.target.value } : d))}
                maxLength={2000}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600" onClick={() => setDecision(null)}>
                Back
              </button>
              <button
                type="button"
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${decision.status === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
                disabled={mDecide.isPending}
                onClick={() =>
                  mDecide.mutate({
                    id: decision.id,
                    status: decision.status,
                    reviewNote: decision.note?.trim() || null
                  })
                }
              >
                {mDecide.isPending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
