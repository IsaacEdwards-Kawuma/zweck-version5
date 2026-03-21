import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import TransactionTable from "../components/TransactionTable";
import { useTransactions } from "../hooks/useTransactions";
import { listDirectors } from "../api/directors";
import { useQuery } from "@tanstack/react-query";
import { deleteTransaction } from "../api/transactions";
import { eur } from "../lib/format";

const TX_ACCOUNT_MAP = {
  CONTRIBUTION: { debit: "bank", credit: "capital" },
  SIDE_FUND: { debit: "bank", credit: "side_fund" },
  MMF_DEPLOY: { debit: "mmf", credit: "bank" },
  MMF_RETURN: { debit: "bank", credit: "mmf_income" },
  YPA_INVEST: { debit: "ypa", credit: "bank" },
  REGISTRATION: { debit: "reg_costs", credit: "bank" },
  TX_CHARGE: { debit: "tx_charge", credit: "bank" },
  LEGAL: { debit: "legal", credit: "bank" },
  PENALTY: { debit: "bank", credit: "penalties" },
  LOAN_IN: { debit: "bank", credit: "loan_income" },
  OTHER_OUT: { debit: "other_exp", credit: "bank" }
};

export default function Ledger() {
  const { me } = useOutletContext() || {};
  const qc = useQueryClient();
  const [type, setType] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filters = useMemo(() => {
    const f = {};
    if (type) f.type = type;
    if (directorId) f.directorId = directorId;
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  }, [type, directorId, from, to]);

  const qTx = useTransactions(filters);
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });

  const mDel = useMutation({
    mutationFn: (id) => deleteTransaction(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["balances"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] })
      ]);
    }
  });

  const all = qTx.data || [];

  const stats = useMemo(() => {
    if (!all.length) {
      return {
        total: 0,
        count: 0,
        avg: 0,
        byType: {},
        runningBank: []
      };
    }
    let total = 0;
    const byType = {};
    let bankRunning = 0;
    const runningBank = all.map((t) => {
      total += t.amount;
      byType[t.type] = (byType[t.type] || 0) + t.amount;
      const map = TX_ACCOUNT_MAP[t.type];
      if (map?.debit === "bank") bankRunning += t.amount;
      if (map?.credit === "bank") bankRunning -= t.amount;
      return { id: t.id, value: bankRunning };
    });
    return {
      total,
      count: all.length,
      avg: total / all.length,
      byType,
      runningBank
    };
  }, [all]);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const clampedPage = Math.min(totalPages, Math.max(1, page));
  const rows = all.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  function exportCsv() {
    const header = [
      "id",
      "date",
      "type",
      "description",
      "director",
      "debitAccount",
      "creditAccount",
      "amount"
    ];
    const lines = [
      header.join(","),
      ...all.map((t) =>
        [
          t.id,
          new Date(t.date).toISOString(),
          t.type,
          `"${(t.description || "").replace(/"/g, '""')}"`,
          `"${(t.director?.name || "").replace(/"/g, '""')}"`,
          t.debitAccount,
          t.creditAccount,
          t.amount
        ].join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zweckos-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetPage() {
    setPage(1);
  }

  if (qTx.isLoading) return <Loading label="Loading ledger..." />;
  if (qTx.error) return <ErrorBanner error={qTx.error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-900">Transaction Ledger</div>
          <div className="text-sm text-slate-600">Newest first. Use filters to narrow down results.</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs font-medium text-slate-700">From</div>
            <input className="mt-1 rounded-lg border-slate-300" type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetPage(); }} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">To</div>
            <input className="mt-1 rounded-lg border-slate-300" type="date" value={to} onChange={(e) => { setTo(e.target.value); resetPage(); }} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Type</div>
            <select className="mt-1 rounded-lg border-slate-300" value={type} onChange={(e) => { setType(e.target.value); resetPage(); }}>
              <option value="">All</option>
              <option value="CONTRIBUTION">CONTRIBUTION</option>
              <option value="SIDE_FUND">SIDE_FUND</option>
              <option value="MMF_DEPLOY">MMF_DEPLOY</option>
              <option value="MMF_RETURN">MMF_RETURN</option>
              <option value="YPA_INVEST">YPA_INVEST</option>
              <option value="REGISTRATION">REGISTRATION</option>
              <option value="TX_CHARGE">TX_CHARGE</option>
              <option value="LEGAL">LEGAL</option>
              <option value="PENALTY">PENALTY</option>
              <option value="LOAN_IN">LOAN_IN</option>
              <option value="OTHER_OUT">OTHER_OUT</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Director</div>
            <select className="mt-1 rounded-lg border-slate-300" value={directorId} onChange={(e) => { setDirectorId(e.target.value); resetPage(); }}>
              <option value="">All</option>
              {(qDirs.data || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700 md:grid-cols-4">
        <div>
          <div className="uppercase tracking-wide text-[10px] text-slate-500">Total amount</div>
          <div className="mt-0.5 font-semibold">{eur(stats.total)}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] text-slate-500">Count</div>
          <div className="mt-0.5 font-semibold">{stats.count}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] text-slate-500">Average</div>
          <div className="mt-0.5 font-semibold">
            {stats.count ? eur(stats.avg) : "—"}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] text-slate-500">
            Bank running balance (in view)
          </div>
          <div className="mt-0.5 font-semibold">
            {eur(stats.runningBank[stats.runningBank.length - 1]?.value || 0)}
          </div>
        </div>
      </div>

      {mDel.error ? <ErrorBanner error={mDel.error} /> : null}

      <TransactionTable rows={rows} showDelete onDelete={(id) => mDel.mutate(id)} isDeleting={mDel.isPending} role={me?.role} />

      <div className="flex items-center justify-between text-sm">
        <div className="text-slate-600">
          Page <span className="font-medium text-slate-900">{clampedPage}</span> of{" "}
          <span className="font-medium text-slate-900">{totalPages}</span> ({all.length} rows)
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            disabled={clampedPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

