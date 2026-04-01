import { Fragment, useCallback, useMemo, useState } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import TransactionTable from "../components/TransactionTable";
import DirectorAvatar from "../components/DirectorAvatar";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { deleteDirectorAvatar, getDirector, uploadDirectorAvatar } from "../api/directors";
import { listInvoices } from "../api/invoices";
import { directorAccount } from "../api/accounts";
import { listDirectorReceiptsV2, markDirectorReceiptViewedV2 } from "../api/directorReceiptsV2";
import { eur, eurCompact, fmtDate, formatMoney, formatTxRef } from "../lib/format";
import { TX_ACCOUNT_MAP } from "../lib/transactionTypes";
import { downloadTransactionsCsv } from "../lib/reportsAnalytics";
import { getDirectorFinancialOverview } from "../api/transactions";
import { hasAdminPrivileges, hasDirectorPrivileges } from "../lib/roles";
import { TX_TYPE_LABELS } from "../lib/dashboardAnalytics";
import { downloadPdf, openPdfInNewTab } from "../lib/openPdf";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";

const PIE_COLORS = ["#2563eb", "#22c55e"];

export default function DirectorDetail() {
  const { id } = useParams();
  const { me } = useOutletContext() || {};
  const qc = useQueryClient();
  const qProfile = useQuery({ queryKey: ["director", id], queryFn: () => getDirector(id) });
  const qTotals = useQuery({ queryKey: ["director_account", id], queryFn: () => directorAccount(id) });
  const directorIdNum = Number(id);
  const qReceipts = useQuery({
    queryKey: ["director_receipts_v2", directorIdNum],
    queryFn: () => listDirectorReceiptsV2(directorIdNum),
    enabled: Number.isFinite(directorIdNum)
  });
  const qOverview = useQuery({
    queryKey: ["director_financial_overview", directorIdNum],
    queryFn: () => getDirectorFinancialOverview(directorIdNum),
    enabled: Number.isFinite(directorIdNum)
  });
  const [seenVersion, setSeenVersion] = useState(0);
  const [expandedDistId, setExpandedDistId] = useState(null);
  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const qLinkedInvoices = useQuery({
    queryKey: ["invoices", "linkedDirector", directorIdNum],
    queryFn: () => listInvoices({ linkedDirectorId: directorIdNum }),
    enabled: Number.isFinite(directorIdNum)
  });

  const txsEarly = useMemo(() => qProfile.data?.transactions ?? [], [qProfile.data]);
  const totalsEarly = useMemo(() => qTotals.data, [qTotals.data]);

  const byType = useMemo(() => {
    const m = new Map();
    for (const t of txsEarly) {
      m.set(t.type, (m.get(t.type) || 0) + (Number(t.amount) || 0));
    }
    return Array.from(m.entries())
      .map(([type, total]) => ({ type, name: TX_TYPE_LABELS[type] || type, total }))
      .sort((a, b) => b.total - a.total);
  }, [txsEarly]);

  const contributionRows = useMemo(() => {
    const txs = qProfile.data?.transactions ?? [];
    return txs.map((t) => {
      const map = TX_ACCOUNT_MAP[t.type];
      return {
        ...t,
        reference: formatTxRef(t.id),
        debitAccount: map?.debit ?? "",
        creditAccount: map?.credit ?? "",
        currency: t.currency || "EUR"
      };
    });
  }, [qProfile.data?.transactions]);

  const capitalPie = useMemo(() => {
    if (!totalsEarly) return [];
    return [
      { name: "Capital", value: Math.max(0, totalsEarly.capital || 0) },
      { name: "Side fund", value: Math.max(0, totalsEarly.sideFund || 0) }
    ];
  }, [totalsEarly]);

  const mAvatar = useMutation({
    mutationFn: ({ file }) => uploadDirectorAvatar(id, file),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["director", id] }),
        qc.invalidateQueries({ queryKey: ["directors"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] }),
        qc.invalidateQueries({ queryKey: ["director_account", id] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["users"] })
      ]);
    }
  });

  const mRemoveAvatar = useMutation({
    mutationFn: () => deleteDirectorAvatar(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["director", id] }),
        qc.invalidateQueries({ queryKey: ["directors"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] }),
        qc.invalidateQueries({ queryKey: ["portfolio"] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["users"] })
      ]);
    }
  });

  const receiptUnviewedCount = useMemo(() => {
    void seenVersion;
    const rows = qReceipts.data || [];
    return rows.filter((r) => !r.isViewed).length;
  }, [qReceipts.data, seenVersion]);

  const markReceiptSeenAndRefresh = useCallback(
    async (receiptId) => {
      try {
        await markDirectorReceiptViewedV2(receiptId);
      } finally {
        setSeenVersion((v) => v + 1);
        qc.invalidateQueries({ queryKey: ["director_receipts_v2", directorIdNum] }).catch(() => {});
      }
    },
    [directorIdNum, qc]
  );

  if (qProfile.isLoading || qTotals.isLoading) return <Loading label="Loading director..." />;
  if (qProfile.error) return <ErrorBanner error={qProfile.error} />;
  if (qTotals.error) return <ErrorBanner error={qTotals.error} />;

  const { director, transactions } = qProfile.data;
  const totals = qTotals.data;
  const hasAnyConfidential =
    Boolean(director?.idNumber) ||
    Boolean(director?.occupation) ||
    Boolean(director?.address) ||
    Boolean(director?.nextOfKinName) ||
    Boolean(director?.nextOfKinPhone) ||
    Boolean(director?.notes);

  const canManagePhoto =
    hasAdminPrivileges(me?.role) ||
    (hasDirectorPrivileges(me?.role) && me?.directorId != null && me.directorId === directorIdNum);

  function uploadErrorMessage(err) {
    const d = err?.response?.data;
    if (typeof d === "string") return d;
    if (d && typeof d.message === "string") return d.message;
    return err?.message || "Upload failed";
  }

  function exportCsv() {
    const rows = (transactions || []).map((t) => ({
      ...t,
      director: { name: director.name }
    }));
    downloadTransactionsCsv(rows, `director-${director.id}-${director.initials}-transactions.csv`);
  }

  function receiptApiPath(id) {
    return `/director-receipts-v2/${id}/pdf`;
  }

  function receiptTypeLabel(type) {
    return TX_TYPE_LABELS[type] || String(type || "—").replace(/_/g, " ");
  }

  function formatStatusLabel(s) {
    return String(s || "").replace(/_/g, " ");
  }

  const overview = qOverview.data;
  const summary = overview?.summary;

  return (
    <div className="space-y-6">
      <PrintStatementHeader
        title={`Director — ${director.name}`}
        subtitle="Capital, side fund, and posted contributions / side fund / penalties"
        meta={`Generated ${new Date().toLocaleString()} · ZweckOS`}
      />

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-start gap-4">
          <DirectorAvatar director={director} size="xl" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-slate-900">{director.name}</div>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {director.initials}
              </span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  director.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                ].join(" ")}
              >
                {director.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-600">{director.email || "—"}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Director since {fmtDate(director.createdAt)}</span>
            </div>
            {canManagePhoto ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg ui-surface px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                    className="hidden"
                    disabled={mAvatar.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) mAvatar.mutate({ file: f });
                    }}
                  />
                  {mAvatar.isPending ? "Uploading…" : "Change photo"}
                </label>
                {director.avatarUrl ? (
                  <button
                    type="button"
                    disabled={mRemoveAvatar.isPending}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                    onClick={() => mRemoveAvatar.mutate()}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            ) : null}
            {mAvatar.error ? (
              <div className="mt-2 text-xs text-rose-700">{uploadErrorMessage(mAvatar.error)}</div>
            ) : null}
            {mRemoveAvatar.error ? (
              <div className="mt-2 text-xs text-rose-700">{uploadErrorMessage(mRemoveAvatar.error)}</div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ui-btn-outline font-medium text-slate-800" onClick={() => window.print()}>
            Print
          </button>
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200 dark:hover:bg-brand-900/60"
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <Link to="/directors" className="text-sm font-medium text-brand-700 hover:underline">
            Back to directors
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total capital contributions</div>
          <div className="mt-1 text-xl font-semibold">
            {qOverview.isLoading ? "…" : formatMoney(summary?.totalCapitalContributions ?? 0, "EUR")}
          </div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Distributions outstanding</div>
          <div className="mt-1 text-xl font-semibold">
            {qOverview.isLoading ? "…" : formatMoney(summary?.totalDistributionsOutstanding ?? 0, "EUR")}
          </div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Company loans outstanding</div>
          <div className="mt-1 text-xl font-semibold">
            {qOverview.isLoading ? "…" : formatMoney(summary?.totalCompanyLoansOutstanding ?? 0, "EUR")}
          </div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Disciplinary levies</div>
          <div className="mt-1 text-xl font-semibold">
            {qOverview.isLoading ? "…" : formatMoney(summary?.totalDisciplinaryLevies ?? 0, "EUR")}
          </div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Interest paid (loans)</div>
          <div className="mt-1 text-xl font-semibold">
            {qOverview.isLoading ? "…" : formatMoney(summary?.totalInterestPaid ?? 0, "EUR")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Capital (balance)</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.capital || 0)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Side fund (balance)</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.sideFund || 0)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total (balance)</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.total || 0)}</div>
        </div>
      </div>

      <div className="rounded-2xl ui-surface p-4">
        <div className="text-sm font-semibold text-slate-900">Profile details</div>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Phone</div>
            <div className="mt-1 text-slate-800">{director.phone || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Email</div>
            <div className="mt-1 text-slate-800">{director.email || "—"}</div>
          </div>
        </div>

        {hasAnyConfidential ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">ID / NIN</div>
                <div className="mt-1 text-slate-800">{director.idNumber || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Occupation</div>
                <div className="mt-1 text-slate-800">{director.occupation || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Address</div>
                <div className="mt-1 text-slate-800">{director.address || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Next of kin</div>
                <div className="mt-1 text-slate-800">{director.nextOfKinName || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Next of kin phone</div>
                <div className="mt-1 text-slate-800">{director.nextOfKinPhone || "—"}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Notes</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{director.notes || "—"}</div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
            Confidential profile details are hidden for your role.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl ui-surface p-4">
          <div className="text-sm font-semibold text-slate-900">Capital vs side fund</div>
          <div className="mt-2 h-56">
            {capitalPie.some((p) => p.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={capitalPie} dataKey="value" nameKey="name" outerRadius={80} label>
                    {capitalPie.map((_, i) => (
                      <Cell key={_.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v) => eur(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No balances yet.</div>
            )}
          </div>
        </div>
        <div className="rounded-2xl ui-surface p-4">
          <div className="text-sm font-semibold text-slate-900">Volume by type (this director)</div>
          <p className="text-xs text-slate-500">Contributions, side fund, penalties in ledger.</p>
          <div className="mt-2 h-56">
            {byType.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={byType} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={(v) => eurCompact(v)} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(v) => eur(v)} />
                  <Bar dataKey="total" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No transactions yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl ui-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">Linked invoices</div>
            <p className="mt-0.5 text-xs text-slate-500">Invoices with this director linked.</p>
          </div>
          {hasAdminPrivileges(me?.role) ? (
            <Link
              to={`/invoices/new?directorId=${directorIdNum}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              New invoice for director
            </Link>
          ) : null}
        </div>
        {qLinkedInvoices.isLoading ? <div className="mt-3 text-sm text-slate-500">Loading invoices…</div> : null}
        {qLinkedInvoices.error ? (
          <div className="mt-3 text-sm text-rose-600">Could not load linked invoices.</div>
        ) : null}
        {!qLinkedInvoices.isLoading && !qLinkedInvoices.error && (qLinkedInvoices.data || []).length === 0 ? (
          <div className="mt-3 text-sm text-slate-500">No linked invoices yet.</div>
        ) : null}
        {(qLinkedInvoices.data || []).length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2"> </th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {(qLinkedInvoices.data || []).map((inv) => (
                  <tr key={inv.id} className="ui-table-row-hover">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{inv.invoiceNumber}</td>
                    <td className="px-3 py-2">{inv.invoiceType}</td>
                    <td className="px-3 py-2">{inv.party?.name || "—"}</td>
                    <td className="px-3 py-2">{fmtDate(inv.invoiceDate)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{inv.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(inv.totalAmount, inv.currency)}</td>
                    <td className="px-3 py-2">
                      <Link to={`/invoices/${inv.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl ui-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">Transaction receipts</div>
            <span
              className={[
                "inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold",
                receiptUnviewedCount > 0 ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700"
              ].join(" ")}
              title="Unviewed receipts"
            >
              {receiptUnviewedCount}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Sorted by date (newest first). View or download marks a receipt as seen.</p>
        </div>
        {qReceipts.isLoading ? <div className="mt-3 text-sm text-slate-500">Loading receipts…</div> : null}
        {qReceipts.error ? <div className="mt-3 text-sm text-rose-600">Could not load receipts.</div> : null}
        {!qReceipts.isLoading && !qReceipts.error && (qReceipts.data || []).length === 0 ? (
          <div className="mt-3 text-sm text-slate-500">No receipts yet.</div>
        ) : null}
        {(qReceipts.data || []).length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {(qReceipts.data || []).map((r) => {
                  return (
                    <tr key={r.id} className="ui-table-row-hover">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{r.referenceNumber}</td>
                      <td className="px-3 py-2">{receiptTypeLabel(r.transactionType)}</td>
                      <td className="px-3 py-2">{r.periodMonth || "—"}</td>
                      <td className="px-3 py-2">{fmtDate(r.transactionDate)}</td>
                      <td className="px-3 py-2">{r.currency || "EUR"}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMoney(Number(r.totalAmount || 0), r.currency || "EUR")}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-600 hover:underline"
                            onClick={() => {
                              void markReceiptSeenAndRefresh(r.id);
                              void openPdfInNewTab(receiptApiPath(r.id)).catch((e) =>
                                alert(e instanceof Error ? e.message : "Could not open PDF")
                              );
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                            onClick={() => {
                              void markReceiptSeenAndRefresh(r.id);
                              void downloadPdf(
                                receiptApiPath(r.id),
                                `director-receipt-${r.referenceNumber || r.id}`
                              ).catch((e) => alert(e instanceof Error ? e.message : "Could not download PDF"));
                            }}
                          >
                            Download PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl ui-surface p-4">
        <div className="text-sm font-semibold text-slate-900">Capital distributions & reinstatements</div>
        <p className="mt-0.5 text-xs text-slate-500">Directors’ capital distributions and payments toward reinstatement.</p>
        {qOverview.isLoading ? <div className="mt-3 text-sm text-slate-500">Loading…</div> : null}
        {qOverview.error ? <div className="mt-3 text-sm text-rose-600">Could not load distributions.</div> : null}
        {!qOverview.isLoading && !qOverview.error && !(overview?.distributions || []).length ? (
          <div className="mt-3 text-sm text-slate-500">No capital distributions recorded.</div>
        ) : null}
        {(overview?.distributions || []).length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Distribution date</th>
                  <th className="px-3 py-2 text-right">Original amount</th>
                  <th className="px-3 py-2 text-right">Total reinstated</th>
                  <th className="px-3 py-2 text-right">Outstanding balance</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {(overview?.distributions || []).map((d) => (
                  <Fragment key={d.id}>
                    <tr className="ui-table-row-hover">
                      <td className="px-3 py-2">{fmtDate(d.distributionDate)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(d.originalAmount, d.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(d.totalReinstated, d.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(d.outstandingBalance, d.currency)}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">{formatStatusLabel(d.status)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-700 hover:underline"
                          onClick={() => setExpandedDistId((x) => (x === d.id ? null : d.id))}
                        >
                          {expandedDistId === d.id ? "Hide reinstatements" : "View reinstatements"}
                        </button>
                      </td>
                    </tr>
                    {expandedDistId === d.id ? (
                      <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                        <td colSpan={6} className="px-3 py-3">
                          {(d.reinstatements || []).length === 0 ? (
                            <div className="text-xs text-slate-600">No reinstatement payments recorded for this distribution.</div>
                          ) : (
                            <table className="min-w-full text-left text-xs">
                              <thead>
                                <tr className="text-slate-500">
                                  <th className="py-1 pr-3">Date</th>
                                  <th className="py-1 pr-3">Amount</th>
                                  <th className="py-1">Currency</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.reinstatements || []).map((row) => (
                                  <tr key={row.id}>
                                    <td className="py-1 pr-3">{fmtDate(row.date)}</td>
                                    <td className="py-1 pr-3 font-medium">{formatMoney(row.amount, row.currency)}</td>
                                    <td className="py-1">{row.currency}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl ui-surface p-4">
        <div className="text-sm font-semibold text-slate-900">Company loans</div>
        <p className="mt-0.5 text-xs text-slate-500">Loans from the company to this director and repayment history.</p>
        {qOverview.isLoading ? <div className="mt-3 text-sm text-slate-500">Loading…</div> : null}
        {qOverview.error ? <div className="mt-3 text-sm text-rose-600">Could not load loans.</div> : null}
        {!qOverview.isLoading && !qOverview.error && !(overview?.loans || []).length ? (
          <div className="mt-3 text-sm text-slate-500">No company loans recorded.</div>
        ) : null}
        {(overview?.loans || []).length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Loan date</th>
                  <th className="px-3 py-2 text-right">Principal amount</th>
                  <th className="px-3 py-2 text-right">Outstanding balance</th>
                  <th className="px-3 py-2 text-right">Interest paid</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {(overview?.loans || []).map((loan) => (
                  <Fragment key={loan.id}>
                    <tr className="ui-table-row-hover">
                      <td className="px-3 py-2">{fmtDate(loan.loanDate)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(loan.principalAmount, loan.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(loan.outstandingBalance, loan.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(loan.interestPaid, loan.currency)}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">{formatStatusLabel(loan.status)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-700 hover:underline"
                          onClick={() => setExpandedLoanId((x) => (x === loan.id ? null : loan.id))}
                        >
                          {expandedLoanId === loan.id ? "Hide repayments" : "View repayments"}
                        </button>
                      </td>
                    </tr>
                    {expandedLoanId === loan.id ? (
                      <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                        <td colSpan={6} className="px-3 py-3">
                          {(loan.repayments || []).length === 0 ? (
                            <div className="text-xs text-slate-600">No repayments recorded yet.</div>
                          ) : (
                            <table className="min-w-full text-left text-xs">
                              <thead>
                                <tr className="text-slate-500">
                                  <th className="py-1 pr-3">Date</th>
                                  <th className="py-1 pr-3 text-right">Total received</th>
                                  <th className="py-1 pr-3 text-right">Principal</th>
                                  <th className="py-1 pr-3 text-right">Interest</th>
                                  <th className="py-1">Currency</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(loan.repayments || []).map((row) => (
                                  <tr key={row.id}>
                                    <td className="py-1 pr-3">{fmtDate(row.date)}</td>
                                    <td className="py-1 pr-3 text-right font-medium">{formatMoney(row.totalReceived, row.currency)}</td>
                                    <td className="py-1 pr-3 text-right">{formatMoney(row.principalPaid, row.currency)}</td>
                                    <td className="py-1 pr-3 text-right">{formatMoney(row.interestPaid, row.currency)}</td>
                                    <td className="py-1">{row.currency}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Contribution history</div>
        <p className="mb-3 text-xs text-slate-500">
          Lists contribution, side fund, and penalty postings for this director (same rules as the API).
        </p>
        <TransactionTable rows={contributionRows} />
      </div>
    </div>
  );
}
