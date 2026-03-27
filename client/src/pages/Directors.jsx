import { useState, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import MetricCard from "../components/MetricCard";
import DirectorCard from "../components/DirectorCard";
import { useDirectorsAll } from "../hooks/useDashboard";
import { createDirector, updateDirector, deleteDirector } from "../api/directors";
import { downloadDirectorsCsv } from "../lib/directorsExport";
import { eur, eurCompact } from "../lib/format";
import { useDarkClass } from "../lib/useDarkClass";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";

export default function Directors() {
  const { me } = useOutletContext() || {};
  const nav = useNavigate();
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";
  const q = useDirectorsAll();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [minTotal, setMinTotal] = useState("");
  const [showTopOnly, setShowTopOnly] = useState(false);

  const [form, setForm] = useState({
    name: "",
    initials: "",
    email: "",
    phone: "",
    idNumber: "",
    occupation: "",
    address: "",
    nextOfKinName: "",
    nextOfKinPhone: "",
    notes: "",
    active: true
  });
  const [editingId, setEditingId] = useState(null);

  const mCreate = useMutation({
    mutationFn: (payload) => createDirector(payload),
    onSuccess: async () => {
      setForm({
        name: "",
        initials: "",
        email: "",
        phone: "",
        idNumber: "",
        occupation: "",
        address: "",
        nextOfKinName: "",
        nextOfKinPhone: "",
        notes: "",
        active: true
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["directors"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] })
      ]);
    }
  });

  const mUpdate = useMutation({
    mutationFn: ({ id, payload }) => updateDirector(id, payload),
    onSuccess: async () => {
      setEditingId(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["directors"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] })
      ]);
    }
  });

  const mDelete = useMutation({
    mutationFn: (id) => deleteDirector(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["directors"] }),
        qc.invalidateQueries({ queryKey: ["directors_all"] })
      ]);
    }
  });

  const directors = useMemo(() => q.data ?? [], [q.data]);

  const filtered = useMemo(() => {
    let list = directors;
    const qv = search.trim().toLowerCase();
    if (qv) {
      list = list.filter(
        (d) =>
          String(d.name || "").toLowerCase().includes(qv) ||
          String(d.email || "").toLowerCase().includes(qv) ||
          (d.initials || "").toLowerCase().includes(qv)
      );
    }
    if (activeFilter === "ACTIVE") list = list.filter((d) => d.active);
    if (activeFilter === "INACTIVE") list = list.filter((d) => !d.active);
    if (minTotal !== "") {
      const n = Number(minTotal);
      if (!Number.isNaN(n)) list = list.filter((d) => Number(d.total || 0) >= n);
    }
    const sorted = [...list];
    if (sortBy === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "total") sorted.sort((a, b) => (b.total || 0) - (a.total || 0));
    return showTopOnly ? sorted.slice(0, 10) : sorted;
  }, [directors, search, sortBy, activeFilter, minTotal, showTopOnly]);

  const stats = useMemo(() => {
    const active = directors.filter((d) => d.active).length;
    const sum = directors.reduce((s, d) => s + (d.total || 0), 0);
    const inactive = directors.length - active;
    const withPhotos = directors.filter((d) => Boolean(d.avatarUrl)).length;
    const withContact = directors.filter((d) => Boolean(d.phone || d.email)).length;
    return { count: directors.length, active, inactive, withPhotos, withContact, sum };
  }, [directors]);

  const chartData = useMemo(() => {
    return filtered.slice(0, 14).map((d) => ({
      name: String(d.name || "").length > 16 ? `${String(d.name || "").slice(0, 14)}…` : String(d.name || "—"),
      total: d.total || 0
    }));
  }, [filtered]);

  const maxTotal = Math.max(0, ...directors.map((d) => d.total || 0));

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "",
      initials: "",
      email: "",
      phone: "",
      idNumber: "",
      occupation: "",
      address: "",
      nextOfKinName: "",
      nextOfKinPhone: "",
      notes: "",
      active: true
    });
  }

  function toggleActive(director) {
    mUpdate.mutate({
      id: director.id,
      payload: {
        name: director.name,
        initials: director.initials,
        email: director.email,
        phone: director.phone ?? "",
        idNumber: director.idNumber ?? "",
        occupation: director.occupation ?? "",
        address: director.address ?? "",
        nextOfKinName: director.nextOfKinName ?? "",
        nextOfKinPhone: director.nextOfKinPhone ?? "",
        notes: director.notes ?? "",
        active: !director.active
      }
    });
  }

  if (q.isLoading) return <Loading label="Loading directors..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold ui-page-heading">Director Accounts</div>
          <div className="text-sm text-slate-600">Capital + side fund totals per director. Search, sort, compare, export.</div>
        </div>
        {directors.length > 0 ? (
          <button
            type="button"
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-brand-100"
            onClick={() => downloadDirectorsCsv(filtered)}
          >
            Export CSV (visible)
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Directors" value={String(stats.count)} sub="In roster" />
        <MetricCard label="Active" value={String(stats.active)} sub="Marked active" />
        <MetricCard label="Inactive" value={String(stats.inactive)} sub="Not active" />
        <MetricCard label="With photos" value={String(stats.withPhotos)} sub="Avatar uploaded" />
        <MetricCard label="With contact" value={String(stats.withContact)} sub="Email or phone" />
        <MetricCard label="Combined total" value={eur(stats.sum)} sub="Capital + side fund" />
      </div>

      <div className="rounded-xl ui-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="dir-search">
              Search
            </label>
            <input
              id="dir-search"
              className="ui-input mt-1 w-full px-3 py-2"
              placeholder="Name, email, initials…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor="dir-sort">
              Sort by
            </label>
            <select id="dir-sort" className="ui-input mt-1 px-3 py-2"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="total">Total (high → low)</option>
              <option value="name">Name (A–Z)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
            <select className="ui-input mt-1 px-3 py-2" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Min total</label>
            <input
              className="ui-input mt-1 w-36 px-3 py-2"
              inputMode="decimal"
              placeholder="0"
              value={minTotal}
              onChange={(e) => setMinTotal(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
            <input type="checkbox" checked={showTopOnly} onChange={(e) => setShowTopOnly(e.target.checked)} />
            Top 10 only
          </label>
          {(search || activeFilter !== "ALL" || minTotal !== "" || showTopOnly) ? (
            <button
              type="button"
              className="ui-btn-outline py-2 text-slate-700"
              onClick={() => {
                setSearch("");
                setSortBy("total");
                setActiveFilter("ALL");
                setMinTotal("");
                setShowTopOnly(false);
              }}
            >
              Reset filters
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs ui-page-muted">
          Showing {filtered.length} of {directors.length} directors
          {search.trim() ? " (filtered)" : ""}.
        </p>
      </div>

      {chartData.length > 0 ? (
        <div className="rounded-2xl ui-surface p-4">
          <div className="text-sm font-semibold ui-page-heading">Totals in current list (top 14)</div>
          <p className="text-xs ui-page-muted">Quick comparison of capital + side fund by director.</p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 4, right: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={52} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => eurCompact(v)} />
                <RechartsTooltip formatter={(v) => eur(v)} />
                <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {me?.role === "ADMIN" && (
        <div className="space-y-3 rounded-xl ui-surface p-4">
          <div className="text-sm font-semibold ui-page-heading">{editingId ? "Edit director" : "Add director"}</div>
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const payload = {
                name: form.name,
                initials: form.initials,
                email: form.email,
                phone: form.phone,
                idNumber: form.idNumber,
                occupation: form.occupation,
                address: form.address,
                nextOfKinName: form.nextOfKinName,
                nextOfKinPhone: form.nextOfKinPhone,
                notes: form.notes,
                active: form.active
              };
              if (editingId) {
                mUpdate.mutate({ id: editingId, payload });
              } else {
                mCreate.mutate(payload);
              }
            }}
          >
            <div>
              <div className="text-xs font-medium text-slate-700">Name</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">Initials</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.initials}
                onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value }))}
                maxLength={3}
                required
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">Email</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">Phone</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">ID / NIN</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.idNumber}
                onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">Occupation</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.occupation}
                onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs font-medium text-slate-700">Address</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">Next of kin</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.nextOfKinName}
                onChange={(e) => setForm((f) => ({ ...f, nextOfKinName: e.target.value }))}
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-700">Next of kin phone</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                value={form.nextOfKinPhone}
                onChange={(e) => setForm((f) => ({ ...f, nextOfKinPhone: e.target.value }))}
              />
            </div>
            <div className="md:col-span-4">
              <div className="text-xs font-medium text-slate-700">Notes</div>
              <textarea
                className="mt-1 w-full rounded-lg border-slate-300"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                id="dir-active"
                type="checkbox"
                className="rounded border-slate-300"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <label htmlFor="dir-active" className="text-xs font-medium text-slate-700">
                Active
              </label>
            </div>
            <div className="flex gap-2 md:col-span-2 md:justify-end">
              {editingId && (
                <button
                  type="button"
                  className="ui-btn-outline-xs font-medium"
                  onClick={() => {
                    resetForm();
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                disabled={mCreate.isPending || mUpdate.isPending}
                className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {editingId ? (mUpdate.isPending ? "Saving..." : "Save changes") : mCreate.isPending ? "Creating..." : "Add director"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((d) => (
          <div key={d.id} className="space-y-2">
            <DirectorCard director={d} maxTotal={maxTotal} onClick={() => nav(`/directors/${d.id}`)} />
            {me?.role === "ADMIN" && (
              <div className="flex gap-2 text-xs">
                <button
                  className="ui-btn-outline-xs font-medium py-1"
                  onClick={() => {
                    setEditingId(d.id);
                    setForm({
                      name: d.name,
                      initials: d.initials,
                      email: d.email,
                      phone: d.phone ?? "",
                      idNumber: d.idNumber ?? "",
                      occupation: d.occupation ?? "",
                      address: d.address ?? "",
                      nextOfKinName: d.nextOfKinName ?? "",
                      nextOfKinPhone: d.nextOfKinPhone ?? "",
                      notes: d.notes ?? "",
                      active: d.active
                    });
                  }}
                >
                  Edit
                </button>
                <button
                  className="ui-btn-outline-xs font-medium py-1"
                  disabled={mUpdate.isPending}
                  onClick={() => toggleActive(d)}
                >
                  {d.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  disabled={mDelete.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete director "${d.name}"? This is only allowed if they have no transactions.`
                      )
                    ) {
                      mDelete.mutate(d.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {directors.length === 0 ? (
          <div className="rounded-xl ui-surface p-4 text-sm ui-body-text">
            No directors yet. Create directors (admin) and start posting contributions.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No directors match your search. Clear the search box to see everyone.
          </div>
        ) : null}
      </div>
    </div>
  );
}
