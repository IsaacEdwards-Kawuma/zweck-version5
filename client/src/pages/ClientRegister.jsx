import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import PageHero from "../components/PageHero";
import MetricCard from "../components/MetricCard";
import { IconBank, IconClipboard, IconListNumbers, IconScale } from "../components/Icons";
import { formatMoney } from "../lib/format";
import { useMe } from "../hooks/useMe";
import { listClients, createClient, updateClient, deleteClient } from "../api/clients";
import { listInvoices } from "../api/invoices";

const PARTY_TYPES = ["CLIENT", "DIRECTOR", "PROJECT_PARTY"];
const CURRENCY_OPTIONS = ["UGX", "USD", "EUR"];

export default function ClientRegister() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe(true);
  const canAdmin = me?.role === "ADMIN";

  const qClients = useQuery({ queryKey: ["clients_all"], queryFn: listClients });
  const qSalesInvoices = useQuery({
    queryKey: ["invoices_sales_for_outstanding"],
    queryFn: () => listInvoices({ invoiceType: "SALES" })
  });

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    type: "CLIENT",
    email: "",
    phone: "",
    address: "",
    currency: "EUR",
    notes: ""
  });

  const clients = qClients.data || [];
  const salesInvoices = qSalesInvoices.data || [];

  const outstandingByClientId = useMemo(() => {
    const map = new Map();
    for (const inv of salesInvoices || []) {
      if (!inv || inv.invoiceType !== "SALES") continue;
      if (inv.status === "VOID" || inv.status === "PAID") continue;
      const due = Number(inv.balanceDue || 0);
      if (due <= 0) continue;
      const pid = inv.partyId;
      map.set(pid, (map.get(pid) || 0) + due);
    }
    return map;
  }, [salesInvoices]);

  const mCreate = useMutation({
    mutationFn: createClient,
    onSuccess: async () => {
      setEditingId(null);
      setForm({ name: "", type: "CLIENT", email: "", phone: "", address: "", currency: "EUR", notes: "" });
      await Promise.all([qc.invalidateQueries({ queryKey: ["clients_all"] }), qc.invalidateQueries({ queryKey: ["invoices_sales_for_outstanding"] })]);
    }
  });

  const mUpdate = useMutation({
    mutationFn: ({ id, payload }) => updateClient(id, payload),
    onSuccess: async () => {
      setEditingId(null);
      await Promise.all([qc.invalidateQueries({ queryKey: ["clients_all"] }), qc.invalidateQueries({ queryKey: ["invoices_sales_for_outstanding"] })]);
    }
  });

  const mDelete = useMutation({
    mutationFn: (id) => deleteClient(id),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["clients_all"] }), qc.invalidateQueries({ queryKey: ["invoices_sales_for_outstanding"] })]);
    }
  });

  if (qClients.isLoading || qSalesInvoices.isLoading) return <Loading label="Loading client register..." />;
  if (qClients.error) return <ErrorBanner error={qClients.error} />;
  if (qSalesInvoices.error) return <ErrorBanner error={qSalesInvoices.error} />;

  const totalOutstanding = Array.from(outstandingByClientId.values()).reduce((s, v) => s + v, 0);

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", type: "CLIENT", email: "", phone: "", address: "", currency: "EUR", notes: "" });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!canAdmin) return;
    const payload = {
      name: form.name,
      type: form.type,
      email: form.email ? form.email : null,
      phone: form.phone ? form.phone : null,
      address: form.address ? form.address : null,
      currency: form.currency,
      notes: form.notes ? form.notes : null
    };
    if (editingId) mUpdate.mutate({ id: editingId, payload });
    else mCreate.mutate(payload);
  }

  if (!canAdmin) {
    // Keep it readable for non-admins.
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconClipboard}
        title="Client Register"
        subtitle="Manage parties (clients / directors / project parties) used by invoices."
      />

      <section className="ui-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Clients" value={String(clients.length)} sub="Non-deleted parties" icon={IconListNumbers} />
        <MetricCard label="Outstanding (Sales)" value={formatMoney(totalOutstanding, "EUR")} sub="Sum of balanceDue" icon={IconBank} />
        <MetricCard label="Admin actions" value={canAdmin ? "Enabled" : "Read-only"} sub="Create/edit/soft-delete" icon={IconScale} />
      </section>

      <section className="ui-panel-elevated rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">{editingId ? "Edit party" : "Add new party"}</div>
          {editingId ? (
            <button type="button" className="ui-btn-outline-xs" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Name
            <input className="ui-input mt-1 w-full" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required disabled={!canAdmin} />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Type
            <select className="ui-input mt-1 w-full" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={!canAdmin}>
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Email
            <input className="ui-input mt-1 w-full" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={!canAdmin} />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Currency
            <select className="ui-input mt-1 w-full" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} disabled={!canAdmin}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
            Phone
            <input className="ui-input mt-1 w-full" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} disabled={!canAdmin} />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-2">
            Address
            <input className="ui-input mt-1 w-full" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} disabled={!canAdmin} />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 md:col-span-4">
            Notes
            <textarea className="ui-input mt-1 w-full" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={!canAdmin} />
          </label>
          <div className="md:col-span-4 flex flex-wrap gap-2">
            <button type="submit" className="ui-btn-primary" disabled={!canAdmin || mCreate.isPending || mUpdate.isPending}>
              {editingId ? "Save changes" : "Create party"}
            </button>
            <button type="button" className="ui-btn-outline" onClick={resetForm} disabled={!canAdmin}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="ui-panel-elevated rounded-2xl p-4">
        <div className="text-sm font-semibold ui-page-heading">Parties</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2 text-right">Outstanding Balance</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {clients.map((c) => (
                <tr key={c.id} className="ui-table-row-hover">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.type}</td>
                  <td className="px-3 py-2 text-slate-600">{c.email || "—"}</td>
                  <td className="px-3 py-2">{c.currency}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(outstandingByClientId.get(c.id) || 0, c.currency)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ui-btn-outline-xs"
                        disabled={!canAdmin}
                        onClick={() => {
                          setEditingId(c.id);
                          setForm({
                            name: c.name,
                            type: c.type,
                            email: c.email || "",
                            phone: c.phone || "",
                            address: c.address || "",
                            currency: c.currency || "EUR",
                            notes: c.notes || ""
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ui-btn-outline-xs"
                        disabled={!canAdmin || mDelete.isPending}
                        onClick={() => {
                          const ok = window.confirm(`Soft-delete "${c.name}"?`);
                          if (!ok) return;
                          mDelete.mutate(c.id);
                        }}
                      >
                        Delete
                      </button>
                      <button type="button" className="ui-btn-outline-xs" onClick={() => nav(`/invoices/new?partyId=${c.id}`)}>
                        Use in Invoice
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!clients.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                    No parties found.
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

