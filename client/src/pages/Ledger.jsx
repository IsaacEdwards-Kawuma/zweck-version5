import { useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import DirectorAvatar from "../components/DirectorAvatar";
import { useTransactions } from "../hooks/useTransactions";
import { listDirectors } from "../api/directors";
import { listTransactions, reverseTransaction, txItems } from "../api/transactions";
import { eur, fmtDate, formatMoney, formatTxRef } from "../lib/format";
import { ALL_TX_TYPE_VALUES, LEDGER_ACCOUNT_FILTER_OPTIONS, TX_TYPE_LABELS } from "../lib/transactionTypes";
import { downloadTransactionsCsv } from "../lib/reportsAnalytics";

export default function Ledger() {
  const qc = useQueryClient();
  const { me } = useOutletContext() || {};
  const [searchParams] = useSearchParams();
  const initialFrom = searchParams.get("from") || "";
  const initialTo = searchParams.get("to") || "";
  const initialType = searchParams.get("type") || "";
  const initialDirectorId = searchParams.get("directorId") || "";
  const initialAccountKey = searchParams.get("accountKey") || "";
  const initialStatus = searchParams.get("status") || "";
  const initialCurrency = searchParams.get("currency") || "";
  const [type, setType] = useState(initialType);
  const [directorId, setDirectorId] = useState(initialDirectorId);
  const [accountKey, setAccountKey] = useState(initialAccountKey);
  const [status, setStatus] = useState(initialStatus);
  const [currency, setCurrency] = useState(initialCurrency);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filters = useMemo(() => {
    const f = {
      limit: pageSize,
      offset: (page - 1) * pageSize
    };
    if (type) f.type = type;
    if (directorId) f.directorId = Number(directorId);
    if (accountKey) f.accountKey = accountKey;
    if (status) f.status = status;
    if (currency) f.currency = currency;
    if (from) f.from = from;
    if (to) f.to = to;
    if (accountKey) {
      f.limit = 100000;
      f.offset = 0;
    }
    return f;
  }, [type, directorId, accountKey, status, currency, from, to, page, pageSize]);

  const qTx = useTransactions(filters);
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });

  const mReverse = useMutation({
    mutationFn: ({ id, payload }) => reverseTransaction(id, payload),
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

  const items = useMemo(() => qTx.data?.items ?? [], [qTx.data?.items]);
  const total = qTx.data?.total ?? 0;
  const agg = qTx.data?.aggregates;

  const stats = useMemo(() => {
    if (!agg) {
      return { total: 0, count: 0, avg: 0, byType: {} };
    }
    return {
      total: agg.sumAmount ?? 0,
      count: agg.count ?? 0,
      avg: agg.avgAmount ?? 0,
      byType: agg.byType ?? {}
    };
  }, [agg]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(totalPages, Math.max(1, page));
  const rows = useMemo(() => {
    const all = [...items];
    all.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return da - db;
      const ra = a.referenceNumber || a.reference || "";
      const rb = b.referenceNumber || b.reference || "";
      return ra.localeCompare(rb);
    });
    if (!accountKey) all.reverse();
    return all;
  }, [items, accountKey]);

  const rowsWithBalance = rows;
  const openingBalance = Number(qTx.data?.openingBalance || 0);
  const closingBalance = Number(qTx.data?.closingBalance || 0);

  function ledgerKeyMatchesFilter(rowKey, filterKey) {
    if (!filterKey || !rowKey) return false;
    if (rowKey === filterKey) return true;
    if (filterKey === "capital" && String(rowKey).startsWith("director_capital_")) return true;
    return false;
  }

  async function exportCsv() {
    const p = {
      limit: 100000,
      offset: 0
    };
    if (type) p.type = type;
    if (directorId) p.directorId = directorId;
    if (from) p.from = from;
    if (to) p.to = to;
    const res = await listTransactions(p);
    const all = txItems(res);
    if (res.total > 100000) {
      window.alert(`Export includes first 100,000 rows only (${res.total} total matches). Narrow filters.`);
    }
    downloadTransactionsCsv(all, "zweckos-ledger.csv");
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
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Account</div>
            <select className="ui-input mt-1 max-w-[min(100%,20rem)]" value={accountKey} onChange={(e) => { setAccountKey(e.target.value); resetPage(); }}>
              <option value="">All</option>
              {LEDGER_ACCOUNT_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Type</div>
            <select className="ui-input mt-1 max-w-[min(100%,20rem)]" value={type} onChange={(e) => { setType(e.target.value); resetPage(); }}>
              <option value="">All</option>
              {ALL_TX_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {TX_TYPE_LABELS[v] || v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Status</div>
            <select className="ui-input mt-1" value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>
              <option value="">All</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
              <option value="DOCUMENT_MISSING">Document Missing</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Currency</div>
            <select className="ui-input mt-1" value={currency} onChange={(e) => { setCurrency(e.target.value); resetPage(); }}>
              <option value="">All</option>
              <option value="UGX">UGX</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
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

      <div className="ui-stat-strip grid grid-cols-1 gap-3 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200 md:grid-cols-3">
        <div>
          <div className="uppercase tracking-wide text-[10px] ui-page-muted">Total amount (filtered)</div>
          <div className="mt-0.5 font-semibold">{eur(stats.total)}</div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Mixed currencies are summed as-is (no FX conversion).
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] text-slate-500">Count (filtered)</div>
          <div className="mt-0.5 font-semibold">{stats.count}</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-[10px] ui-page-muted">Average</div>
          <div className="mt-0.5 font-semibold">
            {stats.count ? eur(stats.avg) : "—"}
          </div>
        </div>
      </div>

      {accountKey ? (
        <div className="ui-surface rounded-xl p-3 text-sm">
          <span className="font-semibold">Opening Balance:</span> {formatMoney(openingBalance, currency || (rowsWithBalance[0]?.currency || "EUR"))}
        </div>
      ) : null}

      <div className="ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="ui-table-head">
            <tr>
              {["Reference", "Date", "Account Code", "Account Name", "Type", "Director", "Posted By", "Project", "Description", "Debit", "Credit", "Currency", "Running Balance", "Document", "Status", "Action"].map((h) => (
                <th key={h} className="px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="ui-table-divide">
            {rowsWithBalance.map((r) => {
              const isDebitSide = accountKey ? ledgerKeyMatchesFilter(r.debitAccountKey, accountKey) : true;
              const accountCode = accountKey ? (isDebitSide ? r.debitAccountCode : r.creditAccountCode) : r.debitAccountCode;
              const accountName = accountKey ? (isDebitSide ? r.debitAccountName : r.creditAccountName) : r.debitAccountName;
              const statusLabel =
                r.postingStatus === "REVERSED"
                  ? "Reversed"
                  : r.postingStatus === "PENDING"
                    ? "Pending"
                    : r.reversalOfId
                      ? "Reversal entry"
                      : "Posted";
              const canReverse =
                me?.role === "ADMIN" &&
                r.postingStatus === "POSTED" &&
                !r.reversalOfId &&
                !r.reversedByTransactionId;
              return (
                <tr key={r.id} className="ui-table-row-hover">
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{r.referenceNumber || r.reference || formatTxRef(r.id)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.ledgerAccountCode ?? accountCode ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.ledgerAccountName ?? accountName ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{TX_TYPE_LABELS[r.type] || String(r.type).replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.director ? <span className="inline-flex items-center gap-2"><DirectorAvatar director={r.director} size="sm" /><span>{r.director.name}</span></span> : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.postedBy || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.project ? `${r.project.code} · ${r.project.name}` : "—"}</td>
                  <td className="px-4 py-3 max-w-[20rem] truncate">{r.description || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{r.debitAccount}</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {formatMoney(Number(r.amount || 0), r.currency || "EUR")}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{r.creditAccount}</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {formatMoney(Number(r.amount || 0), r.currency || "EUR")}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.currency || "EUR"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.runningBalance != null ? formatMoney(r.runningBalance || 0, r.currency || "EUR") : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap" title={r.documentStatus === "MISSING" ? "Document missing" : "Document attached"}>
                    {r.documentStatus === "MISSING" ? "⚠️" : r.documentStatus === "ATTACHED" ? "✅" : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{statusLabel}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {canReverse ? (
                      <button
                        type="button"
                        disabled={mReverse.isPending}
                        className="ui-btn-outline-xs font-semibold disabled:opacity-50"
                        onClick={() => {
                          const reason = (window.prompt("Reversal reason (required for audit):") || "").trim();
                          if (!reason) {
                            window.alert("A reason is required.");
                            return;
                          }
                          mReverse.mutate({ id: r.id, payload: { reason } });
                        }}
                      >
                        Reverse
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rowsWithBalance.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={16}>No transactions yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {accountKey ? (
        <div className="ui-surface rounded-xl p-3 text-sm">
          <span className="font-semibold">Closing Balance:</span> {formatMoney(closingBalance || 0, currency || (rowsWithBalance[0]?.currency || "EUR"))}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <div className="ui-body-text">
          Page <span className="font-medium ui-page-heading">{clampedPage}</span> of{" "}
          <span className="font-medium ui-page-heading">{totalPages}</span> ({total} matching rows)
        </div>
        <div className="flex gap-2">
          <button
            className="ui-btn-outline disabled:opacity-50"
            disabled={accountKey || clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="ui-btn-outline disabled:opacity-50"
            disabled={accountKey || clampedPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
