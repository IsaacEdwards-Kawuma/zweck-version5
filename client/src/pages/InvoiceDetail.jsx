import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import PageHero from "../components/PageHero";
import { IconClipboard, IconBolt } from "../components/Icons";
import { useMe } from "../hooks/useMe";
import { fmtDate, formatMoney } from "../lib/format";
import { getInvoice, sendInvoice, voidInvoice, addPayment, approveProforma, convertProforma, downloadInvoicePdf } from "../api/invoices";

function isoFromDateInput(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}

export default function InvoiceDetail() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams();
  const invoiceId = Number(id);
  const { data: me } = useMe(true);
  const canAdmin = me?.role === "ADMIN";

  const qInvoice = useQuery({ queryKey: ["invoice", invoiceId], queryFn: () => getInvoice(invoiceId), enabled: Number.isFinite(invoiceId) });

  const mSend = useMutation({
    mutationFn: (invoiceId) => sendInvoice(invoiceId),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] })
  });

  const mVoid = useMutation({
    mutationFn: ({ id, reason }) => voidInvoice(id, reason),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] })
  });

  const mAddPayment = useMutation({
    mutationFn: ({ invoiceId, payload }) => addPayment(invoiceId, payload),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] })
  });

  const mApproveProforma = useMutation({
    mutationFn: (invoiceId) => approveProforma(invoiceId),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] })
  });

  const mConvertProforma = useMutation({
    mutationFn: (invoiceId) => convertProforma(invoiceId),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] })
  });

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "EUR",
    paymentMethod: "Bank transfer",
    reference: "",
    notes: ""
  });

  const invoice = qInvoice.data;

  const canEdit = invoice?.status === "DRAFT" && canAdmin;
  const canVoid = canAdmin && (invoice?.status === "DRAFT" || invoice?.status === "SENT");
  const canSend = canAdmin && invoice?.status === "DRAFT";
  const canPayment = invoice && ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) && canAdmin && (invoice.invoiceType === "SALES" || invoice.invoiceType === "PURCHASE");

  const canApproveProforma = canAdmin && invoice?.invoiceType === "PROFORMA" && invoice?.status === "SENT";
  const canConvertProforma = canAdmin && invoice?.invoiceType === "PROFORMA" && invoice?.status === "APPROVED";

  if (qInvoice.isLoading) return <Loading label="Loading invoice..." />;
  if (qInvoice.error) return <ErrorBanner error={qInvoice.error} />;
  if (!invoice) return <ErrorBanner error={new Error("Invoice not found")} />;

  const currency = invoice.currency || "EUR";

  return (
    <div className="space-y-6">
      <PageHero icon={IconClipboard} title={invoice.invoiceNumber} subtitle={`${invoice.invoiceType} · ${invoice.status} · GL: ${invoice.glStatus}`} />

      <section className="ui-panel-elevated rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="ui-surface rounded-xl p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Invoice date</div>
            <div className="mt-1 font-semibold">{fmtDate(invoice.invoiceDate)}</div>
          </div>
          <div className="ui-surface rounded-xl p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Due date</div>
            <div className="mt-1 font-semibold">{fmtDate(invoice.dueDate)}</div>
          </div>
          <div className="ui-surface rounded-xl p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Party</div>
            <div className="mt-1 font-semibold">{invoice.party?.name || "—"}</div>
          </div>
          <div className="ui-surface rounded-xl p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Payment terms</div>
            <div className="mt-1 font-semibold">{invoice.paymentTerms || "—"}</div>
          </div>
        </div>

        <div className="ui-surface rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold ui-page-heading">Totals</div>
              <div className="mt-1 text-xs ui-page-muted">Subtotal + Tax = Grand total</div>
            </div>
            <div className="text-right space-y-1">
              <div className="text-sm font-semibold">Total: {formatMoney(invoice.totalAmount, currency)}</div>
              <div className="text-xs text-slate-600">Subtotal: {formatMoney(invoice.subtotal, currency)} · Tax: {formatMoney(invoice.taxAmount, currency)}</div>
              <div className="text-xs text-slate-600">Paid: {formatMoney(invoice.amountPaid, currency)} · Balance: {formatMoney(invoice.balanceDue, currency)}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit ? (
            <button type="button" className="ui-btn-outline" onClick={() => nav(`/invoices/new?edit=${invoice.id}`)}>
              Edit
            </button>
          ) : null}
          {canSend ? (
            <button type="button" className="ui-btn-primary" onClick={() => mSend.mutate(invoice.id)} disabled={mSend.isPending}>
              Mark as Sent
            </button>
          ) : null}
          {canVoid ? (
            <button
              type="button"
              className="ui-btn-outline"
              onClick={() => {
                const reason = window.prompt("Void reason (required):", "");
                if (!reason || !reason.trim()) return;
                mVoid.mutate({ id: invoice.id, reason: reason.trim() });
              }}
              disabled={mVoid.isPending}
            >
              Void
            </button>
          ) : null}
          {canPayment ? (
            <button
              type="button"
              className="ui-btn-primary"
              onClick={() => {
                setPaymentForm((f) => ({ ...f, currency, paymentDate: new Date().toISOString().slice(0, 10) }));
                setPaymentOpen(true);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <IconBolt className="h-4 w-4" /> Add Payment
              </span>
            </button>
          ) : null}
          {canApproveProforma ? (
            <button type="button" className="ui-btn-primary" onClick={() => mApproveProforma.mutate(invoice.id)} disabled={mApproveProforma.isPending}>
              Approve Proforma
            </button>
          ) : null}
          {canConvertProforma ? (
            <button type="button" className="ui-btn-primary" onClick={() => mConvertProforma.mutate(invoice.id)} disabled={mConvertProforma.isPending}>
              Convert to Invoice
            </button>
          ) : null}
          <button
            type="button"
            className="ui-btn-outline"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                const blob = await downloadInvoicePdf(invoice.id);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${invoice.invoiceNumber}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                alert(e?.message || "PDF download failed");
              } finally {
                setPdfBusy(false);
              }
            }}
          >
            {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </section>

      <section className="ui-panel-elevated rounded-2xl p-4 space-y-4">
        <div className="text-sm font-semibold ui-page-heading">Line items</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Unit Price</th>
                <th className="px-3 py-2">Tax %</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="px-3 py-2">{li.description}</td>
                  <td className="px-3 py-2">{li.quantity}</td>
                  <td className="px-3 py-2">{formatMoney(li.unitPrice, currency)}</td>
                  <td className="px-3 py-2">{li.taxRate}%</td>
                  <td className="px-3 py-2 text-right">{formatMoney(li.subtotal, currency)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(li.taxAmount, currency)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(li.total, currency)}</td>
                </tr>
              ))}
              {!invoice.lineItems.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No line items.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {invoice.notes ? <div className="text-sm text-slate-700 whitespace-pre-wrap">{invoice.notes}</div> : null}
      </section>

      <section className="ui-panel-elevated rounded-2xl p-4 space-y-4">
        <div className="text-sm font-semibold ui-page-heading">Payment history</div>
        {invoice.payments?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">{fmtDate(p.paymentDate)}</td>
                    <td className="px-3 py-2">{p.paymentMethod}</td>
                    <td className="px-3 py-2">{p.reference || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(p.amount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-600">No payments recorded.</div>
        )}
      </section>

      <section className="ui-panel-elevated rounded-2xl p-4 space-y-4">
        <div className="text-sm font-semibold ui-page-heading">GL entries</div>
        {invoice.glTransactions?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Debit</th>
                  <th className="px-3 py-2">Credit</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {invoice.glTransactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2">{fmtDate(t.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{t.referenceNumber}</td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2">{t.manualDebitAccountKey || "—"}</td>
                    <td className="px-3 py-2">{t.manualCreditAccountKey || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(t.amount, t.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-600">No GL entries linked to this invoice yet.</div>
        )}
      </section>

      {paymentOpen ? (
        <div className="ui-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="ui-modal-panel w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-200/50 dark:border-slate-700 dark:bg-slate-950/90 dark:ring-slate-700/80">
            <div className="h-1.5 bg-gradient-to-r from-brand-500 via-sky-400 to-accent-400" aria-hidden />
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add payment</div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Invoice {invoice.invoiceNumber}</div>
                </div>
                <button type="button" className="ui-btn-outline-xs" onClick={() => setPaymentOpen(false)} disabled={mAddPayment.isPending}>
                  Close
                </button>
              </div>

              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const amount = Number(paymentForm.amount);
                  if (!Number.isFinite(amount) || amount <= 0) return;
                  const payload = {
                    paymentDate: isoFromDateInput(paymentForm.paymentDate),
                    amount,
                    currency: paymentForm.currency,
                    paymentMethod: paymentForm.paymentMethod,
                    reference: paymentForm.reference || null,
                    notes: paymentForm.notes || null
                  };
                  mAddPayment
                    .mutateAsync({ invoiceId: invoice.id, payload })
                    .then(() => setPaymentOpen(false))
                    .catch((e) => alert(e?.response?.data?.message || e?.message || "Payment failed"));
                }}
              >
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment date
                  <input type="date" className="ui-input mt-1 w-full" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))} />
                </label>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Amount
                  <input className="ui-input mt-1 w-full" inputMode="decimal" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} required />
                </label>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Currency
                  <select className="ui-input mt-1 w-full" value={paymentForm.currency} onChange={(e) => setPaymentForm((f) => ({ ...f, currency: e.target.value }))}>
                    <option value={invoice.currency}>{invoice.currency}</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment method
                  <input className="ui-input mt-1 w-full" value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentMethod: e.target.value }))} />
                </label>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Reference (optional)
                  <input className="ui-input mt-1 w-full" value={paymentForm.reference} onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} />
                </label>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notes (optional)
                  <textarea className="ui-input mt-1 w-full" rows={3} value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} />
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="ui-btn-outline" onClick={() => setPaymentOpen(false)} disabled={mAddPayment.isPending}>
                    Cancel
                  </button>
                  <button type="submit" className="ui-btn-primary" disabled={mAddPayment.isPending}>
                    {mAddPayment.isPending ? "Saving..." : "Save payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

