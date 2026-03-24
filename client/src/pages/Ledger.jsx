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
      <div className="ui-surface flex flex-col gap-3 rounded-xl p-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold ui-page-heading">Transaction Ledger</div>
          <div className="text-sm ui-body-text">Newest first. Use filters to narrow down results.</div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">From</div>
            <input
              className="ui-input mt-1"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">To</div>
            <input
              className="ui-input mt-1"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                resetPage();
              }}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Type</div>
            <select className="ui-input mt-1" value={type} onChange={(e) => { setType(e.target.value); resetPage(); }}>
              <option value="">All</option>
              <option value="CONTRIBUTION">CONTRIBUTION</option>
              <option value="SIDE_FUND">SIDE_FUND</option>
              <option value="REGISTRATION">REGISTRATION</option>
              <option value="TX_CHARGE">TX_CHARGE</option>
              <option value="LEGAL">LEGAL</option>
              <option value="PENALTY">PENALTY</option>
              <option value="LOAN_IN">LOAN_IN</option>
              <option value="OTHER_OUT">OTHER_OUT</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Director</div>
            <select
              className="ui-input mt-1"
              value={directorId}
              onChange={(e) => {
                setDirectorId(e.target.value);
                resetPage();
              }}
            >
              <option value="">All</option>
              {(qDirs.data || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={exportCsv} className="ui-btn-outline-xs mt-2 font-semibold">
            Export CSV
          </button>
        </div>
      </div>

      <div className="ui-stat-strip grid grid-cols-1 gap-3 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 md:grid-cols-4">
        <div>
          <div className="uppercase tracking-wide text-[10px] ui-page-muted">Total amount</div>
          <div className="mt-0.5 font-semibold">{eur(stats.total)}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] text-slate-500">Count</div>
          <div className="mt-0.5 font-semibold">{stats.count}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] ui-page-muted">Average</div>
          <div className="mt-0.5 font-semibold">
            {stats.count ? eur(stats.avg) : "—"}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] ui-page-muted">Bank running balance (in view)</div>
          <div className="mt-0.5 font-semibold">
            {eur(stats.runningBank[stats.runningBank.length - 1]?.value || 0)}
          </div>
        </div>
      </div>

      <TransactionTable rows={rows} showDelete onDelete={(id) => mDel.mutate(id)} isDeleting={mDel.isPending} role={me?.role} />

      <div className="flex items-center justify-between text-sm">
        <div className="ui-body-text">
          Page <span className="font-medium ui-page-heading">{clampedPage}</span> of{" "}
          <span className="font-medium ui-page-heading">{totalPages}</span> ({all.length} rows)
        </div>
        <div className="flex gap-2">
          <button
            className="ui-btn-outline disabled:opacity-50"
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="ui-btn-outline disabled:opacity-50"
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

