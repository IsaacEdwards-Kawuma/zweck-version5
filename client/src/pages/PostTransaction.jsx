import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import DirectorAvatar from "../components/DirectorAvatar";
import ErrorBanner from "../components/ErrorBanner";
import { postTransaction, deleteTransaction, updateTransaction, listTransactions, txItems } from "../api/transactions";
import { listDirectors } from "../api/directors";
import { fmtDate, formatMoney, formatTxRef, parseMoneyAmountInput, roundToCents } from "../lib/format";
import {
  TX_ACCOUNT_MAP,
  TX_TYPE_GROUPS,
  TX_TYPE_LABELS,
  TX_POSTING_CATEGORY,
  POSTING_BUCKET_OPTIONS,
  filterTxTypeGroupsForBucket,
  firstTxTypeInBucket
} from "../lib/transactionTypes";
const TEMPLATES = [
  { id: "monthly-fee", label: "Monthly charges", type: "TX_CHARGE", amount: "25", description: "Monthly bank/service charges" },
  { id: "registration", label: "Registration fee", type: "REGISTRATION", amount: "50", description: "Director registration charge" },
  { id: "legal", label: "Legal filing", type: "LEGAL", amount: "120", description: "Legal/compliance filing fee" }
];

export default function PostTransaction() {
  const qc = useQueryClient();
  const { me } = useOutletContext() || {};
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });
  const qRecent = useQuery({
    queryKey: ["transactions", "recent-on-post"],
    queryFn: async () => {
      const res = await listTransactions({ limit: 15, offset: 0 });
      return txItems(res);
    }
  });

  const [postingBucket, setPostingBucket] = useState("ALL");
  const [type, setType] = useState("CONTRIBUTION");
  const [directorId, setDirectorId] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [success, setSuccess] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [recentQuery, setRecentQuery] = useState("");
  const [recentType, setRecentType] = useState("ALL");
  const [showOnlyDirectorTx, setShowOnlyDirectorTx] = useState(false);

  const map = TX_ACCOUNT_MAP[type];
  const needsDirector = map?.needsDirector;

  const typeGroupsFiltered = useMemo(() => filterTxTypeGroupsForBucket(postingBucket), [postingBucket]);

  useEffect(() => {
    if (postingBucket === "ALL") return;
    const cat = TX_POSTING_CATEGORY[type];
    if (cat !== postingBucket) {
      const next = firstTxTypeInBucket(postingBucket);
      if (next) setType(next);
    }
  }, [postingBucket]);

  const mPost = useMutation({
    mutationFn: (payload) => postTransaction(payload),
    onSuccess: async () => {
      setSuccess("Transaction posted.");
      setAmount("");
      setDescription("");
      setEditingId(null);
      if (!needsDirector) setDirectorId("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["balances"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] })
      ]);
    }
  });

  const mUpdate = useMutation({
    mutationFn: ({ id, payload }) => updateTransaction(id, payload),
    onSuccess: async () => {
      setSuccess("Transaction updated.");
      setEditingId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["balances"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] })
      ]);
    }
  });

  const mDelete = useMutation({
    mutationFn: (id) => deleteTransaction(id),
    onSuccess: async () => {
      setSuccess("Transaction deleted.");
      if (editingId) setEditingId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["balances"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] })
      ]);
    }
  });

  const preview = useMemo(() => {
    const parsed = parseMoneyAmountInput(amount, currency);
    let n = 0;
    if (parsed.ok) n = parsed.value;
    else {
      const x = Number(amount);
      n = Number.isFinite(x) ? (currency === "UGX" ? Math.round(x) : roundToCents(x)) : 0;
    }
    return {
      debit: map?.debit,
      credit: map?.credit,
      amount: Number.isFinite(n) ? n : 0
    };
  }, [amount, currency, map]);

  const validation = useMemo(() => {
    const parsed = parseMoneyAmountInput(amount, currency);
    if (!parsed.ok) {
      if (amount.trim() === "") return "Enter amount.";
      return parsed.error;
    }
    if (needsDirector && !directorId) return "Select director for this transaction type.";
    return "";
  }, [amount, currency, needsDirector, directorId]);

  const selectedDirector = useMemo(() => {
    if (!needsDirector || !directorId) return null;
    const id = Number(directorId);
    return (qDirs.data || []).find((d) => d.id === id) || null;
  }, [needsDirector, directorId, qDirs.data]);

  function onSubmit(e) {
    e.preventDefault();
    setSuccess(null);
    const parsedAmount = parseMoneyAmountInput(amount, currency);
    if (!parsedAmount.ok) return;
    const payload = {
      type,
      amount: parsedAmount.value,
      currency,
      date: new Date(`${date}T12:00:00.000Z`).toISOString(),
      description: description || undefined,
      directorId: needsDirector ? Number(directorId) : undefined
    };

    if (editingId) {
      // Backend does not support editing CONTRIBUTION transactions.
      if (type === "CONTRIBUTION") {
        setSuccess(
          "Editing contribution transactions is not supported. Delete and re-post instead."
        );
        return;
      }
      mUpdate.mutate({ id: editingId, payload });
    } else {
      mPost.mutate(payload);
    }
  }

  const recentFiltered = useMemo(() => {
    const q = recentQuery.trim().toLowerCase();
    return (qRecent.data || [])
      .filter((t) => (recentType === "ALL" ? true : t.type === recentType))
      .filter((t) => (showOnlyDirectorTx ? Boolean(t.director?.id) : true))
      .filter((t) => {
        if (!q) return true;
        const hay = `${t.type} ${t.description || ""} ${t.director?.name || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [qRecent.data, recentQuery, recentType, showOnlyDirectorTx]);

  function applyTemplate(template) {
    setType(template.type);
    setAmount(template.amount);
    setDescription(template.description);
    setSuccess(`Template loaded: ${template.label}`);
  }

  function applyFromLastTransaction() {
    const list = qRecent.data || [];
    if (!list.length) return;
    const t = list[0];
    const dirId = t.director?.id ?? t.directorId;
    setType(t.type);
    setCurrency(t.currency || "EUR");
    setAmount(String(t.amount ?? ""));
    setDirectorId(dirId != null && dirId !== "" ? String(dirId) : "");
    setDescription(t.description || "");
    setDate(new Date().toISOString().slice(0, 10));
    setSuccess(null);
    setEditingId(null);
  }

  function exportRecentCsv() {
    const headers = ["reference", "date", "type", "currency", "director", "amount", "description"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      headers.join(","),
      ...recentFiltered.map((t) =>
        [
          esc(t.reference || formatTxRef(t.id)),
          esc(fmtDate(t.date)),
          esc(t.type),
          esc(t.currency || "EUR"),
          esc(t.director?.name || ""),
          esc(t.amount),
          esc(t.description || "")
        ].join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recent-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Post Transaction</div>
        <div className="text-sm text-slate-600">All balances will be derived from the transactions table.</div>
      </div>

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      ) : null}

      <div className="rounded-xl ui-surface p-4">
        <div className="text-sm font-semibold text-slate-900">Quick templates</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="ui-btn-outline-xs" onClick={() => applyTemplate(t)}>
              {t.label}
            </button>
          ))}
          <button
            type="button"
            className="ui-btn-outline-xs"
            disabled={!qRecent.data?.length}
            onClick={applyFromLastTransaction}
            title="Copy type, amount, director, and description from the most recent transaction; date set to today"
          >
            Use last transaction
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl ui-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-700">Category</label>
            <select
              className="mt-1 w-full rounded-lg border-slate-300"
              value={postingBucket}
              onChange={(e) => setPostingBucket(e.target.value)}
            >
              {POSTING_BUCKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Type</label>
            <select className="mt-1 w-full rounded-lg border-slate-300" value={type} onChange={(e) => setType(e.target.value)}>
              {typeGroupsFiltered.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {needsDirector ? (
            <div>
              <label className="text-xs font-medium text-slate-700">Director</label>
              <div className="mt-1 flex items-center gap-2">
                {selectedDirector ? <DirectorAvatar director={selectedDirector} size="sm" /> : null}
                <select
                  className="min-w-0 flex-1 rounded-lg border-slate-300"
                  value={directorId}
                  onChange={(e) => setDirectorId(e.target.value)}
                  required
                >
                  <option value="">Select director...</option>
                  {(qDirs.data || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {qDirs.error ? <div className="mt-1 text-xs text-rose-700">Failed to load directors.</div> : null}
            </div>
          ) : null}

          <div>
            <label className="text-xs font-medium text-slate-700">Currency</label>
            <select className="mt-1 w-full rounded-lg border-slate-300" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="UGX">UGX</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Amount ({currency})</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300"
              inputMode="decimal"
              type="number"
              step={currency === "UGX" ? "1" : "0.01"}
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder={currency === "UGX" ? "0" : "0.00"}
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {currency === "UGX" ? "Whole numbers only (no cents)." : "You can include cents (e.g. 2.23)."}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">Date</label>
            <input className="mt-1 w-full rounded-lg border-slate-300" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">Description (optional)</label>
          <input className="mt-1 w-full rounded-lg border-slate-300" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-semibold text-slate-900">
            {editingId ? "Edit transaction preview" : "Preview"}
          </div>
          <div className="mt-1 text-slate-700">
            On <span className="font-medium">{fmtDate(date)}</span>, this will <span className="font-medium">debit</span>{" "}
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{preview.debit}</span>{" "}
            and <span className="font-medium">credit</span>{" "}
            <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">{preview.credit}</span>{" "}
            by <span className="font-semibold">{formatMoney(preview.amount, currency)}</span>.
          </div>
        </div>
        {validation ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{validation}</div>
        ) : null}

        <div className="flex items-center gap-2">
          {editingId && (
            <button
              type="button"
              className="ui-btn-outline px-4 py-2 font-medium text-slate-700"
              onClick={() => {
                setEditingId(null);
                setSuccess(null);
                setType("CONTRIBUTION");
                setDirectorId("");
                setCurrency("EUR");
                setAmount("");
                setDescription("");
              }}
            >
              Cancel edit
            </button>
          )}
          <button
            disabled={Boolean(validation) || mPost.isPending || mUpdate.isPending || (needsDirector && !directorId)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {editingId
              ? mUpdate.isPending
                ? "Saving..."
                : "Save changes"
              : mPost.isPending
              ? "Posting..."
              : "Post Transaction"}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">Recent transactions</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="ui-input px-2 py-1.5 text-sm"
              placeholder="Search recent..."
              value={recentQuery}
              onChange={(e) => setRecentQuery(e.target.value)}
            />
            <select className="ui-input px-2 py-1.5 text-sm" value={recentType} onChange={(e) => setRecentType(e.target.value)}>
              <option value="ALL">All types</option>
              {TX_TYPE_GROUPS.map((g) => (
                <optgroup key={`f-${g.label}`} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
              <input type="checkbox" checked={showOnlyDirectorTx} onChange={(e) => setShowOnlyDirectorTx(e.target.checked)} />
              Director-only
            </label>
            <button type="button" className="ui-btn-outline-xs" onClick={exportRecentCsv}>
              Export visible CSV
            </button>
          </div>
        </div>
        {qRecent.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : qRecent.error ? (
          <ErrorBanner error={qRecent.error} />
        ) : (
          <div className="overflow-x-auto rounded-xl ui-surface text-sm">
            <table className="min-w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Director</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentFiltered.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">
                      {t.reference || formatTxRef(t.id)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">
                      {TX_TYPE_LABELS[t.type] || t.type.replaceAll("_", " ")}
                    </td>
                    <td className="px-3 py-2">
                      {t.director?.name || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">
                      {formatMoney(t.amount, t.currency || "EUR")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="ui-btn-outline-xs font-medium text-slate-700"
                          onClick={() => {
                            setEditingId(t.id);
                            setType(t.type);
                            setCurrency(t.currency || "EUR");
                            setAmount(String(t.amount));
                            setDate(new Date(t.date).toISOString().slice(0, 10));
                            setDescription(t.description || "");
                            setDirectorId(t.director?.id?.toString?.() ?? "");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </button>
                        {me?.role === "ADMIN" && (
                          <button
                            type="button"
                            disabled={mDelete.isPending}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Delete this transaction? This will remove it from the ledger and recompute balances."
                                )
                              ) {
                                mDelete.mutate(t.id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {recentFiltered.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={6}>
                      No transactions match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

