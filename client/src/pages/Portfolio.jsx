import { Link } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { usePortfolio } from "../hooks/useDashboard";
import { eur, pct01, pctFmt01, fmtDate } from "../lib/format";
import {
  buildDirectorStatementCsv,
  buildGeneralDirectorsCsv,
  downloadTextFile,
  printDirectorStatement,
  printGeneralDirectorsStatement
} from "../lib/portfolioExport";
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import DirectorAvatar from "../components/DirectorAvatar";
import PrintStatementHeader from "../components/PrintStatementHeader";
import { useMemo, useState } from "react";

const PIE_COLORS = ["#2563eb", "#0ea5e9", "#22c55e", "#a855f7", "#f59e0b", "#ec4899", "#64748b"];

function AssetCard({ title, value, pct, sub }) {
  return (
    <div className="rounded-xl ui-surface p-4">
      <div className="text-sm font-semibold ui-page-heading">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{eur(value)}</div>
      <div className="mt-1 text-sm ui-body-text">
        {pct01(pct)} of total assets {sub ? <span className="ui-page-muted">• {sub}</span> : null}
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700/80">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.round((pct || 0) * 100)}%` }} />
      </div>
    </div>
  );
}

function filenameSlug(name) {
  return String(name)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 48) || "director";
}

function DirectorProfileCard({ d, portfolio: pf, members: m }) {
  return (
    <div
      className={[
        "ui-surface flex flex-col rounded-xl p-4 transition print:break-inside-avoid print:shadow-none",
        d.active ? "print:border-slate-300" : "opacity-75 print:border-slate-300"
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <DirectorAvatar director={d} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold ui-page-heading">{d.name}</span>
            <span
              className={[
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                d.active
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              ].join(" ")}
            >
              {d.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm ui-body-text">{d.email}</div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs ui-page-muted">
            <span>
              Joined round <span className="font-medium text-slate-700 dark:text-slate-300">{d.joinedRound}</span>
            </span>
            <span>Member since {fmtDate(d.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center dark:border-slate-700">
        <div>
          <div className="text-[10px] uppercase tracking-wide ui-page-muted">Capital</div>
          <div className="mt-0.5 text-sm font-semibold ui-page-heading">{eur(d.capital)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide ui-page-muted">Side fund</div>
          <div className="mt-0.5 text-sm font-semibold ui-page-heading">{eur(d.sideFund)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide ui-page-muted">Total stake</div>
          <div className="mt-0.5 text-sm font-semibold ui-page-heading">{eur(d.total)}</div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <div className="flex justify-between text-xs ui-body-text">
            <span>Share of member equity</span>
            <span className="font-semibold ui-page-heading">{pctFmt01(d.equityShare, 1)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700/80">
            <div
              className="h-2 rounded-full bg-brand-600"
              style={{ width: `${Math.min(100, Math.round((d.equityShare || 0) * 1000)) / 10}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs ui-body-text">
            <span>Share of contributed capital</span>
            <span className="font-semibold ui-page-heading">{pctFmt01(d.capitalShare, 1)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700/80">
            <div
              className="h-2 rounded-full bg-sky-400"
              style={{ width: `${Math.min(100, Math.round((d.capitalShare || 0) * 1000)) / 10}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <button type="button" className="ui-btn-outline-xs font-medium text-slate-800" onClick={() => printDirectorStatement(d, pf, m)}>
          Print statement
        </button>
        <button
          type="button"
          className="ui-btn-outline-xs font-medium text-slate-800"
          onClick={() =>
            downloadTextFile(
              `zweck-director-${d.id}-${filenameSlug(d.name)}-statement.csv`,
              buildDirectorStatementCsv(d, pf, m)
            )
          }
        >
          Download CSV
        </button>
      </div>

      <Link
        to={`/directors/${d.id}`}
        className="mt-3 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        Open full profile & transactions
      </Link>
    </div>
  );
}

export default function Portfolio() {
  const q = usePortfolio();
  const [scenarioAmount, setScenarioAmount] = useState("");

  const members = q.data?.members;

  const barData = useMemo(() => {
    if (!members?.directors?.length) return [];
    return members.directors.map((d) => ({
      label: d.initials || String(d.name).slice(0, 10),
      fullName: d.name,
      equityPct: Math.round((d.equityShare || 0) * 1000) / 10,
      capitalPct: Math.round((d.capitalShare || 0) * 1000) / 10,
      total: d.total
    }));
  }, [members]);

  const pieData = useMemo(() => {
    if (!members?.directors?.length) return [];
    return members.directors
      .filter((d) => (d.equityShare || 0) > 0)
      .map((d) => ({
        name: d.initials || d.name,
        fullName: d.name,
        value: Math.round((d.equityShare || 0) * 10000) / 100
      }));
  }, [members]);

  if (q.isLoading) return <Loading label="Loading portfolio..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const p = q.data;
  const total = p.totalAssets || 0;

  const target = {
    bank: 0.5,
    mmf: 0.3,
    ypa: 0.2
  };

  const currentAlloc = [
    { asset: "Bank", key: "bank", target: target.bank, actual: total ? p.assets.bank / total : 0 },
    { asset: "MMF", key: "mmf", target: target.mmf, actual: total ? p.assets.mmf / total : 0 },
    { asset: "YPA", key: "ypa", target: target.ypa, actual: total ? p.assets.ypa / total : 0 }
  ];

  const radarData = currentAlloc.map((row) => ({
    asset: row.asset,
    Target: Math.round(row.target * 100),
    Actual: Math.round(row.actual * 100)
  }));

  const scenario = (() => {
    const move = Number(scenarioAmount || 0);
    if (!move || move <= 0 || move > p.assets.bank) {
      return null;
    }
    const newBank = p.assets.bank - move;
    const newMMF = p.assets.mmf + move;
    const t = newBank + newMMF + p.assets.ypa;
    return {
      bank: newBank,
      mmf: newMMF,
      ypa: p.assets.ypa,
      total: t
    };
  })();

  const trendData = [
    { name: "Bank", value: p.assets.bank },
    { name: "MMF", value: p.assets.mmf },
    { name: "YPA", value: p.assets.ypa }
  ];

  const barHeight = Math.min(520, Math.max(220, (barData.length || 1) * 40));

  const stmtDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold ui-page-heading">Portfolio</div>
          <div className="text-sm text-slate-600">
            Asset balances from transactions; member equity from contributions and side funds. Target
            ratios below are configurable in code.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            className="ui-btn-outline font-medium text-slate-800"
            onClick={() => window.print()}
          >
            Print page
          </button>
          {members ? (
            <>
              <button
                type="button"
                className="ui-btn-outline font-medium text-slate-800"
                onClick={() => printGeneralDirectorsStatement(p, members)}
              >
                Print general statement
              </button>
              <button
                type="button"
                className="ui-btn-outline font-medium text-slate-800"
                onClick={() =>
                  downloadTextFile(`zweck-directors-statement-${stmtDate}.csv`, buildGeneralDirectorsCsv(p, members))
                }
              >
                Export all (CSV)
              </button>
            </>
          ) : null}
        </div>
      </div>

      <PrintStatementHeader
        title="Portfolio statement"
        subtitle="Asset allocation & member equity overview"
        meta={`Generated ${new Date().toLocaleString()} · EUR · ZweckOS`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AssetCard title="Bank Account" value={p.assets.bank} pct={p.percent.bank} />
        <AssetCard
          title="MMF Investment"
          value={p.assets.mmf}
          pct={p.percent.mmf}
          sub={`Returns earned: ${eur(p.mmfReturns || 0)}`}
        />
        <AssetCard title="YPA Goats Project" value={p.assets.ypa} pct={p.percent.ypa} />
      </div>

      {members && (
        <section className="space-y-4 print:break-inside-avoid">
          <div>
            <div className="text-base font-semibold ui-page-heading">Director portfolio analysis</div>
            <div className="text-sm text-slate-600">
              Equity share = each member&apos;s capital + side fund as a percentage of all members&apos;
              combined stake. Capital share = share of total contributions only (excludes side fund).
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl ui-surface p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total member equity</div>
              <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(members.totalEquity)}</div>
              <div className="mt-1 text-xs text-slate-500">Sum of capital + side fund</div>
            </div>
            <div className="rounded-xl ui-surface p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Contributed capital</div>
              <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(members.totalCapital)}</div>
              <div className="mt-1 text-xs text-slate-500">CONTRIBUTION transactions only</div>
            </div>
            <div className="rounded-xl ui-surface p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Directors</div>
              <div className="mt-1 text-xl font-semibold ui-page-heading">{members.count}</div>
              <div className="mt-1 text-xs text-slate-500">{members.activeCount} active</div>
            </div>
            <div className="rounded-xl ui-surface p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total assets</div>
              <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(p.totalAssets)}</div>
              <div className="mt-1 text-xs text-slate-500">Bank + MMF + YPA</div>
            </div>
          </div>

          {members.totalEquity <= 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No member equity recorded yet. Post contribution or side fund transactions to see per-director
              analysis.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-2xl ui-surface p-4 print:hidden">
                <div className="text-sm font-semibold ui-page-heading">Equity share by director (%)</div>
                <div className="mt-2 text-xs text-slate-500">Of total member equity pool</div>
                <div className="mt-3" style={{ height: barHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={barData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="label" width={44} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        formatter={(value) => [`${value}%`, "Equity share"]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                      />
                      <Bar dataKey="equityPct" name="Equity %" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl ui-surface p-4 print:hidden">
                <div className="text-sm font-semibold ui-page-heading">Equity distribution</div>
                <div className="mt-2 text-xs text-slate-500">Same data as a proportion of the pool</div>
                <div className="mt-2 h-72">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={88}
                          paddingAngle={1}
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value) => `${value}%`}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No positive equity slices to chart.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 text-sm font-semibold ui-page-heading">Member profiles</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {members.directors.map((d) => (
                <DirectorProfileCard key={d.id} d={d} portfolio={p} members={members} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl ui-surface p-4 print:hidden">
          <div className="text-sm font-semibold ui-page-heading">Target vs Actual Allocation</div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="asset" />
                <Radar
                  name="Target"
                  dataKey="Target"
                  stroke="#0ea5e9"
                  fill="#0ea5e9"
                  fillOpacity={0.4}
                />
                <Radar
                  name="Actual"
                  dataKey="Actual"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.3}
                />
                <RechartsTooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-slate-600">
            Targets: Bank 50%, MMF 30%, YPA 20%. Adjust these ratios in the portfolio page if your policy
            changes.
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl ui-surface p-4 print:hidden">
            <div className="text-sm font-semibold ui-page-heading">Scenario: move from Bank to MMF</div>
            <div className="mt-3 text-sm text-slate-600">
              Explore deploying additional cash from the bank into MMF. Front-end only; no transaction is
              posted.
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-700">Amount to move (€)</div>
                <input
                  className="mt-1 w-full rounded-lg border-slate-300"
                  inputMode="decimal"
                  value={scenarioAmount}
                  onChange={(e) => setScenarioAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="text-xs text-slate-500">
                Available in bank: <span className="font-semibold">{eur(p.assets.bank)}</span>
              </div>
            </div>
            {scenario && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Bank after</div>
                  <div className="font-semibold">{eur(scenario.bank)}</div>
                </div>
                <div>
                  <div className="text-slate-500">MMF after</div>
                  <div className="font-semibold">{eur(scenario.mmf)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total assets</div>
                  <div className="font-semibold">{eur(scenario.total)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl ui-surface p-4 print:hidden">
            <div className="text-sm font-semibold ui-page-heading">Asset Snapshot</div>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => eur(value)} />
                  <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
