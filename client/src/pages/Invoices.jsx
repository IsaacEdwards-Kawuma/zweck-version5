import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceMetrics, listInvoices, sendInvoice, voidInvoice, downloadInvoicePdf } from "../api/invoices";
import { listClients } from "../api/clients";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import MetricCard from "../components/MetricCard";
import PageHero from "../components/PageHero";
import { IconBank, IconClipboard, IconListNumbers, IconScale } from "../components/Icons";
import { fmtDate, formatMoney } from "../lib/format";
import { useMe } from "../hooks/useMe";
import { hasAdminPrivileges } from "../lib/roles";

const INVOICE_TYPES = ["ALL", "SALES", "PURCHASE", "PROFORMA", "CREDIT_NOTE"];
const STATUSES = ["ALL", "DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "APPROVED"];
const CURRENCIES = ["ALL", "UGX", "USD", "EUR"];

function paramsOrUndef(value) {
  return value === "ALL" || value === "" ? undefined : value;
}

export default function Invoices() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe(true);

  const [invoiceType, setInvoiceType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [currency, setCurrency] = useState("ALL");
  const [partyId, setPartyId] = useState("");
  const [pdfBusyId, setPdfBusyId] = useState(null);

  const qMetrics = useQuery({ queryKey: ["invoice_metrics"], queryFn: invoiceMetrics });
  const qClients = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const qInvoices = useQuery({
    queryKey: ["invoices", invoiceType, status, currency, partyId],
    queryFn: () =>
      listInvoices({
        invoiceType: paramsOrUndef(invoiceType),
        status: paramsOrUndef(status),
        currency: paramsOrUndef(currency),
        partyId: partyId ? Number(partyId) : undefined
      })
  });

  const mSend = useMutation({
    mutationFn: (id) => sendInvoice(id),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoices"] })
  });

  const mVoid = useMutation({
    mutationFn: ({ id, reason }) => voidInvoice(id, reason),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoices"] })
  });

  if (qMetrics.isLoading || qClients.isLoading || qInvoices.isLoading) return <Loading label="Loading invoices..." />;
  if (qMetrics.error) return <ErrorBanner error={qMetrics.error} />;
  if (qClients.error) return <ErrorBanner error={qClients.error} />;
  if (qInvoices.error) return <ErrorBanner error={qInvoices.error} />;

  const metrics = qMetrics.data || {};
  const clients = qClients.data || [];
  const rows = qInvoices.data || [];

  const canAdmin = hasAdminPrivileges(me?.role);

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconClipboard}
        title="Invoices"
        subtitle="Create, send, track payments, and manage invoice lifecycle with GL postings."
      />

      <section className="ui-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Receivable"
          value={formatMoney(metrics.totalReceivable || 0, "EUR")}
          sub="Sales outstanding (by invoice balanceDue)"
          icon={IconBank}
        />
        <MetricCard
          label="Total Payable"
          value={formatMoney(metrics.totalPayable || 0, "EUR")}
          sub="Purchase outstanding (by invoice balanceDue)"
          icon={IconScale}
        />
        <MetricCard
          label="Overdue Invoices"
          value={String(metrics.overdueCount || 0)}
          sub={metrics.overdueValue != null ? formatMoney(metrics.overdueValue, "EUR") : "—"}
          icon={IconListNumbers}
        />
        <MetricCard label="Invoices" value={String(rows.length)} sub="Matches current filters" icon={IconClipboard} />
      </section>

      <section className="ui-panel-elevated space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Invoice type</label>
            <select className="ui-input mt-1 w-full px-3 py-2" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
              {INVOICE_TYPES.map((x) => (
                <option key={x} value={x}>
                  {x === "ALL" ? "All types" : x}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px]">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
            <select className="ui-input mt-1 w-full px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((x) => (
                <option key={x} value={x}>
                  {x === "ALL" ? "All statuses" : x}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px]">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Currency</label>
            <select className="ui-input mt-1 w-full px-3 py-2" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((x) => (
                <option key={x} value={x}>
                  {x === "ALL" ? "All currencies" : x}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[260px] flex-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Party</label>
            <select className="ui-input mt-1 w-full px-3 py-2" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">All parties</option>
              {clients.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="ui-panel-elevated rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Invoice list</div>
          <button type="button" className="ui-btn-primary" onClick={() => nav("/invoices/new")} disabled={!canAdmin}>
            New invoice
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Invoice Number</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Amount Paid</th>
                <th className="px-3 py-2 text-right">Balance Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">GL Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {rows.map((r) => (
                <tr key={r.id} className="ui-table-row-hover">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.invoiceNumber}</td>
                  <td className="px-3 py-2">{r.invoiceType}</td>
                  <td className="px-3 py-2">{r.party?.name || "—"}</td>
                  <td className="px-3 py-2">{fmtDate(r.invoiceDate)}</td>
                  <td className="px-3 py-2">{fmtDate(r.dueDate)}</td>
                  <td className="px-3 py-2">{r.currency}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.totalAmount, r.currency)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.amountPaid, r.currency)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.balanceDue, r.currency)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{r.status}</span>
                  </td>
                  <td className="px-3 py-2">{r.glStatus}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ui-btn-outline-xs" onClick={() => nav(`/invoices/${r.id}`)}>
                        View
                      </button>
                      {r.status === "DRAFT" ? (
                        <button type="button" className="ui-btn-outline-xs" disabled={!canAdmin} onClick={() => nav(`/invoices/new?edit=${r.id}`)}>
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ui-btn-outline-xs"
                        disabled={pdfBusyId === r.id}
                        onClick={async () => {
                          setPdfBusyId(r.id);
                          try {
                            const blob = await downloadInvoicePdf(r.id);
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${r.invoiceNumber}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch (e) {
                            alert(e?.message || "PDF download failed");
                          } finally {
                            setPdfBusyId(null);
                          }
                        }}
                      >
                        {pdfBusyId === r.id ? "PDF…" : "Download PDF"}
                      </button>
                      {r.status === "DRAFT" ? (
                        <button
                          type="button"
                          className="ui-btn-outline-xs"
                          disabled={!canAdmin || mSend.isPending}
                          onClick={() => mSend.mutate(r.id)}
                        >
                          Mark as Sent
                        </button>
                      ) : null}
                      {(r.status === "DRAFT" || r.status === "SENT") && r.invoiceType !== "PROFORMA" ? (
                        <button
                          type="button"
                          className="ui-btn-outline-xs"
                          disabled={!canAdmin || mVoid.isPending}
                          onClick={() => {
                            const reason = window.prompt("Void reason (required):", "");
                            if (!reason || !reason.trim()) return;
                            mVoid.mutate({ id: r.id, reason: reason.trim() });
                          }}
                        >
                          Void
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-slate-500">
                    No invoices found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

