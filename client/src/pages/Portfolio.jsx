import { Link } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { useQuery } from "@tanstack/react-query";
import { getAboutPage } from "../api/aboutPage";
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
import PageHero, { SectionTitle } from "../components/PageHero";
import MetricCard from "../components/MetricCard";
import {
  IconBank,
  IconBuilding,
  IconChartPie,
  IconPortfolio,
  IconRadar,
  IconScale,
  IconSparkles,
  IconUsers,
  IconWallet
} from "../components/Icons";
import { useDarkClass } from "../lib/useDarkClass";
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

function DirectorProfileCard({ d, portfolio: pf, directorsBlock: m, companyInfo }) {
  return (
    <div
      className={[
        "ui-surface flex flex-col rounded-xl p-4 transition-all duration-300 print:break-inside-avoid print:shadow-none",
        "hover:-translate-y-1 hover:shadow-lg hover:ring-2 hover:ring-brand-500/15 dark:hover:ring-brand-400/20",
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
            <span>Share of director equity</span>
            <span className="font-semibold ui-page-heading">{pctFmt01(d.equityShare, 1)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.min(100, Math.round((d.equityShare || 0) * 1000)) / 10}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs ui-body-text">
            <span>Share of contributed capital</span>
            <span className="font-semibold ui-page-heading">{pctFmt01(d.capitalShare, 1)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.min(100, Math.round((d.capitalShare || 0) * 1000)) / 10}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          className="ui-btn-outline-xs font-medium text-slate-800"
          onClick={() => {
            if (!companyInfo) return window.alert("Loading company information for printing…");
            printDirectorStatement(d, pf, m, companyInfo);
          }}
        >
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
  const dark = useDarkClass();
  const gridStroke = dark ? "#475569" : "#e2e8f0";

  const qAbout = useQuery({
    queryKey: ["about-page"],
    queryFn: getAboutPage
  });

  const directorsBlock = q.data?.directors;

  const barData = useMemo(() => {
    if (!directorsBlock?.list?.length) return [];
    return directorsBlock.list.map((d) => ({
      label: d.initials || String(d.name).slice(0, 10),
      fullName: d.name,
      equityPct: Math.round((d.equityShare || 0) * 1000) / 10,
      capitalPct: Math.round((d.capitalShare || 0) * 1000) / 10,
      total: d.total
    }));
  }, [directorsBlock]);

  const pieData = useMemo(() => {
    if (!directorsBlock?.list?.length) return [];
    return directorsBlock.list
      .filter((d) => (d.equityShare || 0) > 0)
      .map((d) => ({
        name: d.initials || d.name,
        fullName: d.name,
        value: Math.round((d.equityShare || 0) * 10000) / 100
      }));
  }, [directorsBlock]);

  if (q.isLoading) return <Loading label="Loading portfolio..." />;
  if (q.error) return <ErrorBanner error={q.error} />;

  const aboutPayload = qAbout.data?.payload;
  const productName = aboutPayload?.headerProductName || "ZweckOS";
  const companyInfo = aboutPayload
    ? {
        companyName: aboutPayload.headerCompanyName,
        companyLocation: aboutPayload.headerLocation,
        productName,
        preparedBy: aboutPayload.preparedByLabel,
        authorisedBy: aboutPayload.authorisedByLabel
      }
    : undefined;

  const p = q.data;
  const split = p.split || [{ key: "bank", name: "Bank", value: p.assets.bank || 0 }];
  const bankValue = split.find((s) => s.key === "bank")?.value ?? p.assets.bank ?? 0;
  const total = p.totalAssets || 0;

  const currentAlloc = split.map((row) => ({
    asset: row.name,
    key: row.key,
    target: split.length > 0 ? 1 / split.length : 0,
    actual: total ? row.value / total : 0
  }));

  const radarData = currentAlloc.map((row) => ({
    asset: row.asset,
    Target: Math.round(row.target * 100),
    Actual: Math.round(row.actual * 100)
  }));

  const scenario = (() => {
    const reserve = Number(scenarioAmount || 0);
    if (!reserve || reserve <= 0 || reserve > bankValue) return null;
    return {
      bank: reserve,
      total: p.totalAssets || 0
    };
  })();

  const trendData = split.map((item) => ({ name: item.name, value: item.value }));

  const barHeight = Math.min(520, Math.max(220, (barData.length || 1) * 40));

  const stmtDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="ui-animate-in space-y-8">
      <PageHero
        icon={IconPortfolio}
        title="Portfolio"
        subtitle="Asset balances from transactions; member equity from contributions and side funds. Target ratios below are configurable in code."
      >
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            className="ui-btn-outline font-medium text-slate-800 shadow-sm transition-all hover:-translate-y-0.5"
            onClick={() => window.print()}
          >
            Print page
          </button>
          {directorsBlock ? (
            <>
              <button
                type="button"
                className="ui-btn-outline font-medium text-slate-800 shadow-sm transition-all hover:-translate-y-0.5"
                onClick={() => {
                  if (!companyInfo) return window.alert("Loading company information for printing…");
                  printGeneralDirectorsStatement(p, directorsBlock, companyInfo);
                }}
              >
                Print general statement
              </button>
              <button
                type="button"
                className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-100 dark:border-brand-500/40 dark:bg-brand-950/50 dark:text-brand-200"
                onClick={() =>
                  downloadTextFile(`zweck-directors-statement-${stmtDate}.csv`, buildGeneralDirectorsCsv(p, directorsBlock))
                }
              >
                Export all (CSV)
              </button>
            </>
          ) : null}
        </div>
      </PageHero>

      <PrintStatementHeader
        title="Portfolio statement"
        subtitle="Asset allocation & director equity overview"
        meta={`Generated ${new Date().toLocaleString()} · EUR · ZweckOS`}
      />

      <div className="ui-stagger grid grid-cols-1 gap-4 md:grid-cols-3">
        <AssetCard title="Bank Account" value={bankValue} pct={total ? bankValue / total : 0} icon={IconBank} />
        <AssetCard title="Total Assets" value={p.totalAssets} pct={1} icon={IconBuilding} />
        <AssetCard
          title="Active Projects"
          value={Math.max(0, p.totalAssets - bankValue)}
          pct={total ? (p.totalAssets - bankValue) / total : 0}
          icon={IconChartPie}
        />
      </div>

      {directorsBlock && (
        <section className="space-y-4 print:break-inside-avoid">
          <div>
            <SectionTitle icon={IconUsers}>Director portfolio analysis</SectionTitle>
            <p className="mt-2 text-sm ui-page-muted">
              Equity share = each director&apos;s capital + side fund as a percentage of all directors&apos;
              combined stake. Capital share = share of total contributions only (excludes side fund).
            </p>
          </div>

          <div className="ui-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              label="Total director equity"
              value={eur(directorsBlock.totalEquity)}
              sub="Sum of capital + side fund"
              icon={IconScale}
            />
            <MetricCard
              label="Contributed capital"
              value={eur(directorsBlock.totalCapital)}
              sub="CONTRIBUTION transactions only"
              icon={IconBank}
            />
            <MetricCard
              label="Total side fund"
              value={eur(directorsBlock.totalSideFund ?? 0)}
              sub="SIDE_FUND transactions only"
              icon={IconWallet}
            />
            <MetricCard
              label="Directors"
              value={String(directorsBlock.count)}
              sub={`${directorsBlock.activeCount} active`}
              icon={IconUsers}
            />
            <MetricCard
              label="Total assets"
              value={eur(p.totalAssets)}
              sub="Bank and project-linked assets"
              icon={IconBuilding}
            />
          </div>

          {directorsBlock.totalEquity <= 0 ? (
            <div className="ui-animate-pop rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
              No director equity recorded yet. Post contribution or side fund transactions to see per-director
              analysis.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="ui-panel-elevated print:hidden">
                <div className="text-sm font-semibold ui-page-heading">Equity share by director (%)</div>
                <div className="mt-2 text-xs ui-page-muted">Of total director equity pool</div>
                <div className="mt-3" style={{ height: barHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={barData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
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

              <div className="ui-panel-elevated print:hidden">
                <div className="text-sm font-semibold ui-page-heading">Equity distribution</div>
                <div className="mt-2 text-xs ui-page-muted">Same data as a proportion of the pool</div>
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
            <div className="mb-3 flex items-center gap-2">
              <span className="h-6 w-1 rounded-full bg-gradient-to-b from-brand-500 to-sky-500" aria-hidden />
              <h3 className="text-lg font-semibold ui-page-heading">Director profiles</h3>
            </div>
            <div className="ui-stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
              {directorsBlock.list.map((d) => (
                <DirectorProfileCard
                  key={d.id}
                  d={d}
                  portfolio={p}
                  directorsBlock={directorsBlock}
                  companyInfo={companyInfo}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ui-panel-elevated print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-brand-600 dark:text-brand-400">
              <IconRadar className="h-5 w-5" />
            </span>
            <div className="text-sm font-semibold ui-page-heading">Target vs actual allocation</div>
          </div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke={gridStroke} />
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
            Split across bank and active projects. Values are refreshed from live portfolio data.
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-panel-elevated print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400">
                <IconSparkles className="h-5 w-5" />
              </span>
              <div className="text-sm font-semibold ui-page-heading">Scenario: planned bank reserve</div>
            </div>
            <div className="mt-3 text-sm ui-page-muted">
              Explore maintaining a reserve from current bank assets. Front-end only; no transaction is posted.
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-700">Reserve amount (€)</div>
                <input
                  className="mt-1 w-full rounded-lg border-slate-300"
                  inputMode="decimal"
                  value={scenarioAmount}
                  onChange={(e) => setScenarioAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="text-xs text-slate-500">
                Available in bank: <span className="font-semibold">{eur(bankValue)}</span>
              </div>
            </div>
            {scenario && (
              <div className="ui-animate-pop mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Bank after</div>
                  <div className="font-semibold">{eur(scenario.bank)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total assets</div>
                  <div className="font-semibold">{eur(scenario.total)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Coverage</div>
                  <div className="font-semibold">{pct01(scenario.total ? scenario.bank / scenario.total : 0)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="ui-panel-elevated print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-sky-600 dark:text-sky-400">
                <IconChartPie className="h-5 w-5" />
              </span>
              <div className="text-sm font-semibold ui-page-heading">Asset snapshot</div>
            </div>
            <div className="mt-2 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
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
