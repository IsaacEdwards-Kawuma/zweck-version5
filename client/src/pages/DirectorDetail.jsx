import { useMemo } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import TransactionTable from "../components/TransactionTable";
import DirectorAvatar from "../components/DirectorAvatar";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { deleteDirectorAvatar, getDirector, uploadDirectorAvatar } from "../api/directors";
import { directorAccount } from "../api/accounts";
import { eur, eurCompact, fmtDate } from "../lib/format";
import { downloadTransactionsCsv } from "../lib/reportsAnalytics";
import { TX_TYPE_LABELS } from "../lib/dashboardAnalytics";
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

  if (qProfile.isLoading || qTotals.isLoading) return <Loading label="Loading director..." />;
  if (qProfile.error) return <ErrorBanner error={qProfile.error} />;
  if (qTotals.error) return <ErrorBanner error={qTotals.error} />;

  const { director, transactions } = qProfile.data;
  const totals = qTotals.data;

  const directorIdNum = Number(id);
  const canManagePhoto =
    me?.role === "ADMIN" ||
    (me?.role === "DIRECTOR" && me?.directorId != null && me.directorId === directorIdNum);

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
            <div className="mt-1 text-sm text-slate-600">{director.email}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                Joined round <span className="font-medium text-slate-700">{director.joinedRound}</span>
              </span>
              <span>Member since {fmtDate(director.createdAt)}</span>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Capital</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.capital || 0)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Side Fund</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.sideFund || 0)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.total || 0)}</div>
        </div>
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

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Contribution history</div>
        <p className="mb-3 text-xs text-slate-500">
          Lists contribution, side fund, and penalty postings for this director (same rules as the API).
        </p>
        <TransactionTable rows={transactions || []} />
      </div>
    </div>
  );
}
