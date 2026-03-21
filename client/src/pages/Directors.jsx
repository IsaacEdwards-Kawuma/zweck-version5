import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import DirectorCard from "../components/DirectorCard";
import { useDirectorsAll } from "../hooks/useDashboard";
import { createDirector, updateDirector, deleteDirector } from "../api/directors";

export default function Directors() {
  const { me } = useOutletContext() || {};
  const nav = useNavigate();
  const q = useDirectorsAll();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    initials: "",
    email: "",
    joinedRound: "",
    active: true
  });
  const [editingId, setEditingId] = useState(null);

  const mCreate = useMutation({
    mutationFn: (payload) => createDirector(payload),
    onSuccess: async () => {
      setForm({ name: "", initials: "", email: "", joinedRound: "", active: true });
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

  if (q.isLoading) return <Loading label="Loading directors..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const directors = q.data || [];
  const maxTotal = Math.max(0, ...directors.map((d) => d.total || 0));

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-900">Director Accounts</div>
        <div className="text-sm text-slate-600">Capital + side fund totals per director.</div>
      </div>

      {me?.role === "ADMIN" && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">
            {editingId ? "Edit director" : "Add director"}
          </div>
          {(mCreate.error || mUpdate.error || mDelete.error) && (
            <ErrorBanner error={mCreate.error || mUpdate.error || mDelete.error} />
          )}
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const payload = {
                name: form.name,
                initials: form.initials,
                email: form.email,
                joinedRound: form.joinedRound ? Number(form.joinedRound) : undefined,
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
              <div className="text-xs font-medium text-slate-700">Joined round</div>
              <input
                className="mt-1 w-full rounded-lg border-slate-300"
                type="number"
                min={1}
                value={form.joinedRound}
                onChange={(e) => setForm((f) => ({ ...f, joinedRound: e.target.value }))}
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
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ name: "", initials: "", email: "", joinedRound: "", active: true });
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
        {directors.map((d) => (
          <div key={d.id} className="space-y-2">
            <DirectorCard director={d} maxTotal={maxTotal} onClick={() => nav(`/directors/${d.id}`)} />
            {me?.role === "ADMIN" && (
              <div className="flex gap-2 text-xs">
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setEditingId(d.id);
                    setForm({
                      name: d.name,
                      initials: d.initials,
                      email: d.email,
                      joinedRound: d.joinedRound?.toString?.() ?? "",
                      active: d.active
                    });
                  }}
                >
                  Edit
                </button>
                <button
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  disabled={mDelete.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete director "${d.name}"? This is only allowed if they have no transactions.`)) {
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
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            No directors yet. Create directors (admin) and start posting contributions.
          </div>
        ) : null}
      </div>
    </div>
  );
}

