import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import DirectorAvatar from "../components/DirectorAvatar";
import ErrorBanner from "../components/ErrorBanner";
import {
  postTransaction,
  deleteTransaction,
  reverseTransaction,
  listTransactions,
  txItems,
  getPreviewReference,
  uploadTransactionDocument
} from "../api/transactions";
import { listDirectors } from "../api/directors";
import { fmtDate, formatMoney, formatTxRef, parseMoneyAmountInput, roundToCents } from "../lib/format";
function bankPreviewLabel(currency) {
  if (currency === "UGX") return "1200 Cash at Bank (UGX)";
  if (currency === "USD") return "1210 Cash at Bank (USD)";
  return "1220 Cash at Bank (EUR)";
}

export default function PostTransaction() {
  const qc = useQueryClient();
  const { me } = useOutletContext() || {};
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });
  const qPreviewRef = useQuery({ queryKey: ["tx-preview-ref"], queryFn: getPreviewReference });
  const qRecent = useQuery({
    queryKey: ["transactions", "recent-on-post"],
    queryFn: async () => {
      const res = await listTransactions({ limit: 15, offset: 0 });
      return txItems(res);
    }
  });

  const [directorId, setDirectorId] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [success, setSuccess] = useState(null);
  const [recentQuery, setRecentQuery] = useState("");
  const [showOnlyDirectorTx, setShowOnlyDirectorTx] = useState(false);

  const invalidateAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["balances"] }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["directors_all"] }),
      qc.invalidateQueries({ queryKey: ["portfolio"] }),
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["tx-preview-ref"] })
    ]);
  };

  const mPost = useMutation({
    mutationFn: (payload) => postTransaction(payload),
    onSuccess: async () => {
      setSuccess("Contribution posted.");
      setAmount("");
      setDescription("");
      setExternalReference("");
      setDocumentUrl("");
      setDirectorId("");
      await invalidateAll();
    }
  });

  const mDelete = useMutation({
    mutationFn: (id) => deleteTransaction(id),
    onSuccess: async () => {
      setSuccess("Transaction deleted.");
      await invalidateAll();
    }
  });

  const mReverse = useMutation({
    mutationFn: ({ id, payload }) => reverseTransaction(id, payload),
    onSuccess: async () => {
      setSuccess("Reversal posted. Original marked reversed; audit trail preserved.");
      await invalidateAll();
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
      debit: bankPreviewLabel(currency),
      credit: "Director capital (selected director)",
      amount: Number.isFinite(n) ? n : 0
    };
  }, [amount, currency]);

  const validation = useMemo(() => {
    if (!date) return "Select a date.";
    const parsed = parseMoneyAmountInput(amount, currency);
    if (!parsed.ok) {
      if (amount.trim() === "") return "Enter amount.";
      return parsed.error;
    }
    if (parsed.value <= 0) return "Amount must be greater than zero.";
    if (!directorId) return "Select director.";
    return "";
  }, [amount, currency, directorId, date]);

  const selectedDirector = useMemo(() => {
    if (!directorId) return null;
    const id = Number(directorId);
    return (qDirs.data || []).find((d) => d.id === id) || null;
  }, [directorId, qDirs.data]);

  function buildPayload() {
    const parsedAmount = parseMoneyAmountInput(amount, currency);
    if (!parsedAmount.ok) return null;
    return {
      type: "CONTRIBUTION",
      amount: parsedAmount.value,
      currency,
      date: new Date(`${date}T12:00:00.000Z`).toISOString(),
      description: description || undefined,
      externalReference: externalReference.trim() || undefined,
      documentUrl: documentUrl || undefined,
      directorId: Number(directorId)
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    setSuccess(null);
    const payload = buildPayload();
    if (!payload) return;
    mPost.mutate(payload);
  }

  async function onPickDocument(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    setUploadingDoc(true);
    try {
      const { documentUrl: url } = await uploadTransactionDocument(f);
      setDocumentUrl(url);
    } catch {
      setSuccess("Document upload failed.");
    } finally {
      setUploadingDoc(false);
    }
  }

  const recentFiltered = useMemo(() => {
    const q = recentQuery.trim().toLowerCase();
    return (qRecent.data || [])
      .filter((t) => (showOnlyDirectorTx ? Boolean(t.director?.id) : true))
      .filter((t) => {
        if (!q) return true;
        const hay = `${t.type} ${t.description || ""} ${t.director?.name || ""} ${t.referenceNumber || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [qRecent.data, recentQuery, showOnlyDirectorTx]);

  function exportRecentCsv() {
    const headers = ["reference", "date", "type", "currency", "director", "amount", "description"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      headers.join(","),
      ...recentFiltered.map((t) =>
        [
          esc(t.referenceNumber || t.reference || formatTxRef(t.id)),
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

  const previewRefLabel = qPreviewRef.data?.referenceNumber || "…";

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Post contribution</div>
        <div className="text-sm text-slate-600">
          Records director capital: debit cash at bank (by currency), credit the selected director&apos;s capital
          account. UGX → 1200, USD → 1210, EUR → 1220.
        </div>
      </div>

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl ui-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-700">Reference number</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-200 bg-slate-50 font-mono text-sm"
              readOnly
              value={previewRefLabel}
              title="Assigned when you post (sequential per month)"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">External reference (optional)</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300"
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              maxLength={200}
              placeholder="Invoice #, bank ref, etc."
            />
          </div>

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
          <label className="text-xs font-medium text-slate-700">Source document (PDF or image, optional)</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input type="file" accept="application/pdf,image/*" onChange={onPickDocument} disabled={uploadingDoc} />
            {uploadingDoc ? <span className="text-xs text-slate-500">Uploading…</span> : null}
            {documentUrl ? (
              <a href={documentUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">
                View attached
              </a>
            ) : (
              <span className="text-xs text-amber-700">If omitted, transaction posts with DOCUMENT MISSING.</span>
            )}
          </div>
          <input
            className="mt-2 w-full rounded-lg border-slate-300 text-sm"
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
            placeholder="Paste document link/path (e.g. https://... or /uploads/...)"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-700">Description (optional)</label>
          <input className="mt-1 w-full rounded-lg border-slate-300" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-semibold text-slate-900">Preview</div>
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

        <button
          disabled={Boolean(validation) || mPost.isPending || !directorId}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {mPost.isPending ? "Posting..." : "Post contribution"}
        </button>
      </form>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">Recent contributions</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="ui-input px-2 py-1.5 text-sm"
              placeholder="Search recent..."
              value={recentQuery}
              onChange={(e) => setRecentQuery(e.target.value)}
            />
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
                  <th className="px-3 py-2">Director</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Doc</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentFiltered.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-slate-600">
                      {t.referenceNumber || t.reference || formatTxRef(t.id)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2">{t.director?.name || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">{formatMoney(t.amount, t.currency || "EUR")}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{t.documentStatus || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {me?.role === "ADMIN" &&
                          t.postingStatus === "POSTED" &&
                          !t.reversalOfId &&
                          !t.reversedByTransactionId && (
                            <button
                              type="button"
                              className="ui-btn-outline-xs font-medium text-brand-800"
                              disabled={mReverse.isPending}
                              onClick={() => {
                                const reason = (window.prompt("Reversal reason (required for audit):") || "").trim();
                                if (!reason) {
                                  window.alert("A reason is required.");
                                  return;
                                }
                                mReverse.mutate({ id: t.id, payload: { reason } });
                              }}
                            >
                              Reverse
                            </button>
                          )}
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
