import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import DirectorAvatar from "../components/DirectorAvatar";
import ErrorBanner from "../components/ErrorBanner";
import { postTransaction, deleteTransaction, updateTransaction, listTransactions } from "../api/transactions";
import { listDirectors } from "../api/directors";
import { eur, fmtDate } from "../lib/format";

const TX_ACCOUNT_MAP = {
  CONTRIBUTION: { debit: "bank", credit: "capital", needsDirector: true },
  SIDE_FUND: { debit: "bank", credit: "side_fund", needsDirector: true },
  REGISTRATION: { debit: "reg_costs", credit: "bank", needsDirector: false },
  TX_CHARGE: { debit: "tx_charge", credit: "bank", needsDirector: false },
  LEGAL: { debit: "legal", credit: "bank", needsDirector: false },
  PENALTY: { debit: "bank", credit: "penalties", needsDirector: true },
  LOAN_IN: { debit: "bank", credit: "loan_income", needsDirector: false },
  OTHER_OUT: { debit: "other_exp", credit: "bank", needsDirector: false }
};

export default function PostTransaction() {
  const qc = useQueryClient();
  const { me } = useOutletContext() || {};
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });
  const qRecent = useQuery({
    queryKey: ["transactions", "recent-on-post"],
    queryFn: async () => {
      const all = await listTransactions();
      return all.slice(0, 10);
    }
  });

  const [type, setType] = useState("CONTRIBUTION");
  const [directorId, setDirectorId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [success, setSuccess] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const map = TX_ACCOUNT_MAP[type];
  const needsDirector = map?.needsDirector;

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
    const n = Number(amount || 0);
    return {
      debit: map?.debit,
      credit: map?.credit,
      amount: n
    };
  }, [amount, map]);

  const selectedDirector = useMemo(() => {
    if (!needsDirector || !directorId) return null;
    const id = Number(directorId);
    return (qDirs.data || []).find((d) => d.id === id) || null;
  }, [needsDirector, directorId, qDirs.data]);

  function onSubmit(e) {
    e.preventDefault();
    setSuccess(null);
    const payload = {
      type,
      amount: Number(amount),
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

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Post Transaction</div>
        <div className="text-sm text-slate-600">All balances will be derived from the transactions table.</div>
      </div>

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl ui-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-700">Type</label>
            <select className="mt-1 w-full rounded-lg border-slate-300" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.keys(TX_ACCOUNT_MAP).map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll("_", " ")}
                </option>
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
            <label className="text-xs font-medium text-slate-700">Amount (€)</label>
            <input
              className="mt-1 w-full rounded-lg border-slate-300"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
            />
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
            by <span className="font-semibold">{eur(preview.amount)}</span>.
          </div>
        </div>

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
                setAmount("");
                setDescription("");
              }}
            >
              Cancel edit
            </button>
          )}
          <button
            disabled={mPost.isPending || mUpdate.isPending || (needsDirector && !directorId)}
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
        <div className="text-sm font-semibold text-slate-900">Recent transactions</div>
        {qRecent.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : qRecent.error ? (
          <ErrorBanner error={qRecent.error} />
        ) : (
          <div className="overflow-x-auto rounded-xl ui-surface text-sm">
            <table className="min-w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Director</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(qRecent.data || []).map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">
                      {t.type.replaceAll("_", " ")}
                    </td>
                    <td className="px-3 py-2">
                      {t.director?.name || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">
                      {eur(t.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="ui-btn-outline-xs font-medium text-slate-700"
                          onClick={() => {
                            setEditingId(t.id);
                            setType(t.type);
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
                {(qRecent.data || []).length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                      No transactions yet.
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

