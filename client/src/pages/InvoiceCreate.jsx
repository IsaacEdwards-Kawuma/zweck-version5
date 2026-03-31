import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import PageHero from "../components/PageHero";
import { IconClipboard } from "../components/Icons";
import { useMe } from "../hooks/useMe";
import { formatMoney } from "../lib/format";
import { hasAdminPrivileges } from "../lib/roles";
import { listClients } from "../api/clients";
import { listProjects } from "../api/projects"; // listProjects is exported in api/projects.js
import { listDirectors } from "../api/directors";
import { createInvoice, getInvoice, updateInvoice, sendInvoice } from "../api/invoices";

const REVENUE_ACCOUNT_KEYS = [
  "income_project",
  "mmf_income",
  "income_investment",
  "income_interest",
  "income_dividend",
  "rental_income",
  "income_other",
  "penalties",
  "income_fx"
];

const EXPENSE_ACCOUNT_KEYS = [
  "reg_costs",
  "tx_charge",
  "legal",
  "other_exp",
  "exp_transport",
  "exp_communication",
  "exp_office",
  "exp_printing",
  "exp_salaries",
  "exp_utilities",
  "exp_insurance",
  "exp_meals",
  "project_exp",
  "capex",
  "exp_fx"
];

function isoFromDateInput(dateStr) {
  // Convert `YYYY-MM-DD` to ISO at UTC midnight.
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}

function roundForCurrency(n, currency) {
  const x = Number(n || 0);
  if (currency === "UGX") return Math.round(x);
  return Math.round(x * 100) / 100;
}

function computeLine(li, currency) {
  const quantity = Number(li.quantity || 0);
  const unitPrice = Number(li.unitPrice || 0);
  const taxRate = Number(li.taxRate || 0);
  const subtotalRaw = unitPrice * quantity;
  const taxRaw = subtotalRaw * (taxRate / 100);
  const subtotal = roundForCurrency(subtotalRaw, currency);
  const taxAmount = roundForCurrency(taxRaw, currency);
  const total = roundForCurrency(subtotal + taxAmount, currency);
  return { subtotal, taxAmount, total };
}

function computeTotals(lineItems, currency) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const li of lineItems || []) {
    const c = computeLine(li, currency);
    subtotal += c.subtotal;
    taxAmount += c.taxAmount;
  }
  subtotal = roundForCurrency(subtotal, currency);
  taxAmount = roundForCurrency(taxAmount, currency);
  const totalAmount = roundForCurrency(subtotal + taxAmount, currency);
  return { subtotal, taxAmount, totalAmount };
}

export default function InvoiceCreate() {
  const nav = useNavigate();
  const { data: me } = useMe(true);
  const canAdmin = hasAdminPrivileges(me?.role);
  const [sp] = useSearchParams();
  const editId = sp.get("edit") ? Number(sp.get("edit")) : null;

  const qClients = useQuery({ queryKey: ["clients_all"], queryFn: listClients });
  const qProjects = useQuery({
    queryKey: ["projects_all_for_invoice"],
    queryFn: () => listProjects()
  });
  const qDirectors = useQuery({ queryKey: ["directors_all"], queryFn: () => listDirectors() });

  const qInvoice = useQuery({
    queryKey: ["invoice", editId],
    queryFn: () => (editId ? getInvoice(editId) : null),
    enabled: Boolean(editId)
  });

  const [form, setForm] = useState(() => {
    const partyQ = sp.get("partyId");
    const projQ = sp.get("projectId");
    const dirQ = sp.get("directorId");
    const cnQ = sp.get("creditNoteForId");
    return {
      invoiceType: "SALES",
      partyId: partyQ && Number.isFinite(Number(partyQ)) ? String(Number(partyQ)) : "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      paymentTerms: "Net 30",
      currency: "EUR",
      linkedProjectId: projQ && Number.isFinite(Number(projQ)) ? String(Number(projQ)) : "",
      linkedDirectorId: dirQ && Number.isFinite(Number(dirQ)) ? String(Number(dirQ)) : "",
      glRevenueAccountKey: "income_project",
      glExpenseAccountKey: "reg_costs",
      notes: "",
      documentUrl: "",
      creditNoteForId: cnQ && Number.isFinite(Number(cnQ)) ? Number(cnQ) : null,
      lineItems: [
        {
          key: crypto.randomUUID(),
          description: "",
          quantity: 1,
          unitPrice: 0,
          taxRate: 0
        }
      ]
    };
  });

  const totals = useMemo(() => computeTotals(form.lineItems, form.currency), [form.lineItems, form.currency]);

  useEffect(() => {
    if (!qInvoice.data) return;
    const inv = qInvoice.data;
    // Avoid triggering the "setState in effect" lint rule by scheduling the update.
    const next = {
      invoiceType: inv.invoiceType,
      partyId: String(inv.partyId),
      invoiceDate: String(inv.invoiceDate).slice(0, 10),
      dueDate: String(inv.dueDate).slice(0, 10),
      paymentTerms: inv.paymentTerms || "",
      currency: inv.currency || "EUR",
      linkedProjectId: inv.linkedProjectId != null ? String(inv.linkedProjectId) : "",
      linkedDirectorId: inv.linkedDirectorId != null ? String(inv.linkedDirectorId) : "",
      glRevenueAccountKey: inv.glRevenueAccountKey || "income_project",
      glExpenseAccountKey: inv.glExpenseAccountKey || "reg_costs",
      notes: inv.notes || "",
      documentUrl: inv.documentUrl || "",
      creditNoteForId: inv.creditNoteForId || null,
      lineItems: (inv.lineItems || []).map((li) => ({
        key: crypto.randomUUID(),
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxRate: li.taxRate
      }))
    };
    setTimeout(() => {
      setForm((f) => ({ ...f, ...next }));
    }, 0);
  }, [qInvoice.data]);

  const status = qInvoice.data?.status || "DRAFT";
  const readOnly = editId && status !== "DRAFT";

  const mSave = useMutation({
    mutationFn: async () => {
      const payload = {
        invoiceType: form.invoiceType,
        partyId: Number(form.partyId),
        invoiceDate: isoFromDateInput(form.invoiceDate),
        dueDate: isoFromDateInput(form.dueDate),
        paymentTerms: form.paymentTerms,
        currency: form.currency,
        linkedProjectId: form.linkedProjectId ? Number(form.linkedProjectId) : null,
        linkedDirectorId: form.linkedDirectorId ? Number(form.linkedDirectorId) : null,
        glRevenueAccountKey: form.invoiceType === "PURCHASE" ? null : form.glRevenueAccountKey,
        glExpenseAccountKey: form.invoiceType === "SALES" || form.invoiceType === "PROFORMA" || form.invoiceType === "CREDIT_NOTE" ? null : form.glExpenseAccountKey,
        notes: form.notes || null,
        documentUrl: form.documentUrl || null,
        creditNoteForId: form.invoiceType === "CREDIT_NOTE" ? form.creditNoteForId : null,
        lineItems: form.lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          taxRate: Number(li.taxRate)
        }))
      };

      if (!editId) {
        const created = await createInvoice(payload);
        return { id: created.id };
      }

      await updateInvoice(editId, payload);
      return { id: editId };
    }
  });

  const mSend = useMutation({
    mutationFn: async () => {
      const res = await mSave.mutateAsync();
      if (!res?.id) throw new Error("Missing invoice id");
      await sendInvoice(res.id);
      return { id: res.id };
    }
  });

  if (qClients.isLoading || qProjects.isLoading || qDirectors.isLoading || (editId && qInvoice.isLoading)) {
    return <Loading label="Loading invoice form..." />;
  }
  if (qClients.error) return <ErrorBanner error={qClients.error} />;
  if (qProjects.error) return <ErrorBanner error={qProjects.error} />;
  if (qDirectors.error) return <ErrorBanner error={qDirectors.error} />;
  if (qInvoice.error) return <ErrorBanner error={qInvoice.error} />;

  const clients = qClients.data || [];
  const projects = qProjects.data || [];
  const directors = qDirectors.data || [];

  const revenueOptions = REVENUE_ACCOUNT_KEYS;
  const expenseOptions = EXPENSE_ACCOUNT_KEYS;

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconClipboard}
        title={editId ? "Edit invoice" : "Create invoice"}
        subtitle="Draft, send, track payments, and manage invoice lifecycle."
      />

      <section className="ui-panel-elevated rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Invoice type
            <select
              className="ui-input mt-1 w-full"
              value={form.invoiceType}
              onChange={(e) => {
                const nextType = e.target.value;
                setForm((f) => ({
                  ...f,
                  invoiceType: nextType,
                  glRevenueAccountKey: nextType === "PURCHASE" ? f.glRevenueAccountKey : f.glRevenueAccountKey,
                  glExpenseAccountKey: nextType === "PURCHASE" ? f.glExpenseAccountKey : f.glExpenseAccountKey
                }));
              }}
              disabled={readOnly}
            >
              <option value="SALES">SALES</option>
              <option value="PURCHASE">PURCHASE</option>
              <option value="PROFORMA">PROFORMA</option>
              <option value="CREDIT_NOTE">CREDIT_NOTE</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Party
            <div className="flex gap-2">
              <select
                className="ui-input mt-1 w-full"
                value={form.partyId}
                onChange={(e) => setForm((f) => ({ ...f, partyId: e.target.value }))}
                disabled={readOnly}
              >
                <option value="">Select a party...</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
              <button type="button" className="ui-btn-outline mt-1" onClick={() => nav("/invoices/clients")} disabled={!canAdmin}>
                Add
              </button>
            </div>
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Invoice date
            <input type="date" className="ui-input mt-1 w-full" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} disabled={readOnly} />
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Due date
            <input type="date" className="ui-input mt-1 w-full" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} disabled={readOnly} />
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
            Payment terms
            <input className="ui-input mt-1 w-full" value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} disabled={readOnly} />
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Currency
            <select className="ui-input mt-1 w-full" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} disabled={readOnly}>
              <option value="UGX">UGX</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Linked Director (optional)
            <select
              className="ui-input mt-1 w-full"
              value={form.linkedDirectorId}
              onChange={(e) => setForm((f) => ({ ...f, linkedDirectorId: e.target.value }))}
              disabled={readOnly}
            >
              <option value="">—</option>
              {directors.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
            Linked Project (optional)
            <select
              className="ui-input mt-1 w-full"
              value={form.linkedProjectId}
              onChange={(e) => setForm((f) => ({ ...f, linkedProjectId: e.target.value }))}
              disabled={readOnly}
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>

          {form.invoiceType !== "PURCHASE" ? (
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
              Revenue account (4xxx)
              <select
                className="ui-input mt-1 w-full"
                value={form.glRevenueAccountKey}
                onChange={(e) => setForm((f) => ({ ...f, glRevenueAccountKey: e.target.value }))}
                disabled={readOnly}
              >
                {revenueOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
              Expense account (5xxx)
              <select
                className="ui-input mt-1 w-full"
                value={form.glExpenseAccountKey}
                onChange={(e) => setForm((f) => ({ ...f, glExpenseAccountKey: e.target.value }))}
                disabled={readOnly}
              >
                {expenseOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
            Notes (optional)
            <textarea className="ui-input mt-1 w-full" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={readOnly} />
          </label>
        </div>

        <section className="ui-surface rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold ui-page-heading">Line items</div>
            <button
              type="button"
              className="ui-btn-outline-xs"
              disabled={readOnly}
              onClick={() => {
                setForm((f) => ({
                  ...f,
                  lineItems: [
                    ...f.lineItems,
                    { key: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, taxRate: 0 }
                  ]
                }));
              }}
            >
              Add row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="ui-table-head">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Unit Price</th>
                  <th className="px-3 py-2">Tax Rate %</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                  <th className="px-3 py-2">Remove</th>
                </tr>
              </thead>
              <tbody className="ui-table-divide">
                {form.lineItems.map((li, idx) => {
                  const c = computeLine(li, form.currency);
                  return (
                    <tr key={li.key}>
                      <td className="px-3 py-2">
                        <input
                          className="ui-input w-full"
                          value={li.description}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = [...f.lineItems];
                              next[idx] = { ...next[idx], description: v };
                              return { ...f, lineItems: next };
                            });
                          }}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="ui-input w-24"
                          inputMode="decimal"
                          value={li.quantity}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = [...f.lineItems];
                              next[idx] = { ...next[idx], quantity: v };
                              return { ...f, lineItems: next };
                            });
                          }}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="ui-input w-28"
                          inputMode="decimal"
                          value={li.unitPrice}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = [...f.lineItems];
                              next[idx] = { ...next[idx], unitPrice: v };
                              return { ...f, lineItems: next };
                            });
                          }}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="ui-input w-24"
                          inputMode="decimal"
                          value={li.taxRate}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = [...f.lineItems];
                              next[idx] = { ...next[idx], taxRate: v };
                              return { ...f, lineItems: next };
                            });
                          }}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(c.total, form.currency)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="ui-btn-outline-xs"
                          disabled={readOnly || form.lineItems.length <= 1}
                          onClick={() => {
                            setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }));
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <div className="text-xs text-slate-500">Subtotal: {formatMoney(totals.subtotal, form.currency)}</div>
            <div className="text-xs text-slate-500">Tax: {formatMoney(totals.taxAmount, form.currency)}</div>
            <div className="text-sm font-semibold">Total: {formatMoney(totals.totalAmount, form.currency)}</div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            type="button"
            className="ui-btn-outline"
            disabled={!canAdmin || readOnly || mSave.isPending}
            onClick={() => mSave.mutateAsync().then((r) => nav(`/invoices/${r.id}`))}
          >
            Save as Draft
          </button>
          <button
            type="button"
            className="ui-btn-primary"
            disabled={!canAdmin || readOnly || mSend.isPending}
            onClick={() =>
              mSend
                .mutateAsync()
                .then((r) => nav(`/invoices/${r.id}`))
                .catch((e) => alert(e?.message || "Failed to send"))
            }
          >
            Send
          </button>
        </section>
      </section>
    </div>
  );
}

