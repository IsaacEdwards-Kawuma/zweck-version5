import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { useMMF } from "../hooks/useMMF";
import { listDirectors } from "../api/directors";
import { listProjects } from "../api/projects";
import { createMMF } from "../api/mmf";
import { ugx } from "../lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from "recharts";

export default function MMFTracker() {
  const qc = useQueryClient();
  const [mmfProjectId, setMmfProjectId] = useState("");
  const q = useMMF(mmfProjectId === "" ? undefined : Number(mmfProjectId));
  const qDirs = useQuery({ queryKey: ["directors"], queryFn: listDirectors });
  const qProjects = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const mmfProjects = (qProjects.data || []).filter((p) => p.projectKind === "MMF");

  const [directorId, setDirectorId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [accountType, setAccountType] = useState("company");
  const [notes, setNotes] = useState("");
  const [filterDirectorId, setFilterDirectorId] = useState("");
  const [filterAccountType, setFilterAccountType] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const mCreate = useMutation({
    mutationFn: (payload) => createMMF(payload),
    onSuccess: async () => {
      setPrincipal("");
      setInterest("");
      setInterestRate("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["mmf"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const entries = q.data || [];

  const filtered = entries.filter((e) => {
    if (filterDirectorId && String(e.directorId) !== filterDirectorId) return false;
    if (filterAccountType && e.accountType !== filterAccountType) return false;
    if (filterYear && !e.month.startsWith(filterYear)) return false;
    return true;
  });

  const totalProfit = useMemo(
    () => filtered.reduce((s, e) => s + (e.interest || 0), 0),
    [filtered]
  );

  const byDirector = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const cur = map.get(e.directorId) || { principal: 0, interest: 0 };
      cur.principal += e.principal || 0;
      cur.interest += e.interest || 0;
      map.set(e.directorId, cur);
    }
    return Array.from(map.entries()).map(([directorId, agg]) => ({
      directorId,
      principal: agg.principal,
      interest: agg.interest,
      effectiveRate: agg.principal ? (agg.interest / agg.principal) * 100 : 0
    }));
  }, [filtered]);

  const interestByMonth = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      map.set(e.month, (map.get(e.month) || 0) + (e.interest || 0));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([month, interest]) => ({ month, interest }));
  }, [filtered]);

  if (q.isLoading || qProjects.isLoading) return <Loading label="Loading MMF tracker..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm text-sky-950">
        <div className="font-medium">Link to an MMF program project</div>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-sky-800">MMF project</div>
            <select
              className="ui-input mt-1 border-sky-300 dark:border-sky-700"
              value={mmfProjectId}
              onChange={(e) => setMmfProjectId(e.target.value)}
            >
              <option value="">All entries (no project filter)</option>
              {mmfProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          {mmfProjectId ? (
            <Link
              className="text-sm font-medium text-sky-800 underline"
              to={`/project/${mmfProjectId}`}
            >
              Open project budget & tasks
            </Link>
          ) : (
            <span className="text-xs text-sky-800">
              Create an MMF project under{" "}
              <Link className="font-medium underline" to="/projects">
                All projects
              </Link>{" "}
              to tag entries and track budgets.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-900">MMF Tracker</div>
          <div className="text-sm text-slate-600">
            Historical UGX entries. Optionally link new rows to an MMF project for budgeting.
          </div>
        </div>
        <div className="rounded-lg ui-surface px-3 py-2 text-sm">
          Running total profit: <span className="font-semibold">{ugx(totalProfit)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Filter director
          </div>
          <select
            className="mt-1 rounded-lg border-slate-300"
            value={filterDirectorId}
            onChange={(e) => setFilterDirectorId(e.target.value)}
          >
            <option value="">All</option>
            {(qDirs.data || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Account type
          </div>
          <select
            className="mt-1 rounded-lg border-slate-300"
            value={filterAccountType}
            onChange={(e) => setFilterAccountType(e.target.value)}
          >
            <option value="">All</option>
            <option value="personal">personal</option>
            <option value="company">company</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Year
          </div>
          <input
            className="mt-1 w-24 rounded-lg border-slate-300"
            placeholder="2026"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mCreate.mutate({
            directorId: Number(directorId),
            projectId: mmfProjectId ? Number(mmfProjectId) : null,
            month,
            principal: Number(principal || 0),
            interest: Number(interest || 0),
            interestRate: Number(interestRate || 0),
            accountType,
            notes: notes || undefined
          });
        }}
        className="space-y-3 rounded-xl ui-surface p-4"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs font-medium text-slate-700">Director</div>
            <select className="mt-1 w-full rounded-lg border-slate-300" value={directorId} onChange={(e) => setDirectorId(e.target.value)} required>
              <option value="">Select...</option>
              {(qDirs.data || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Month</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Account type</div>
            <select className="mt-1 w-full rounded-lg border-slate-300" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              <option value="personal">personal</option>
              <option value="company">company</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Principal (UGX)</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Interest (UGX)</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} required />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">Rate (%)</div>
            <input className="mt-1 w-full rounded-lg border-slate-300" inputMode="decimal" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} required />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-700">Notes (optional)</div>
          <input className="mt-1 w-full rounded-lg border-slate-300" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button disabled={mCreate.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {mCreate.isPending ? "Saving..." : "Add MMF Entry"}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Director</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Principal</th>
              <th className="px-4 py-3 text-right">Interest</th>
              <th className="px-4 py-3 text-right">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3">{e.month}</td>
                <td className="px-4 py-3">{e.directorId}</td>
                <td className="px-4 py-3">{e.accountType}</td>
                <td className="px-4 py-3 text-right">{ugx(e.principal)}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-700">{ugx(e.interest)}</td>
                <td className="px-4 py-3 text-right">{e.interestRate}%</td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                  No MMF entries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl ui-surface p-3">
            <div className="text-sm font-semibold text-slate-900">
              Totals by director (filtered)
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-2">Director</th>
                    <th className="py-2 pr-2 text-right">Principal</th>
                    <th className="py-2 pr-2 text-right">Interest</th>
                    <th className="py-2 pr-2 text-right">Eff. rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byDirector.map((row) => (
                    <tr key={row.directorId}>
                      <td className="py-1.5 pr-2">
                        {row.directorId}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{ugx(row.principal)}</td>
                      <td className="py-1.5 pr-2 text-right">{ugx(row.interest)}</td>
                      <td className="py-1.5 pr-2 text-right">
                        {row.effectiveRate.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                  {!byDirector.length && (
                    <tr>
                      <td className="py-3 text-center text-slate-500" colSpan={4}>
                        No data for current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl ui-surface p-3">
            <div className="text-sm font-semibold text-slate-900">
              Monthly interest (filtered)
            </div>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={interestByMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RechartsTooltip formatter={(value) => ugx(value)} />
                  <Bar dataKey="interest" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

