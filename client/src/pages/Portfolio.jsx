import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { usePortfolio } from "../hooks/useDashboard";
import { eur, pct01 } from "../lib/format";
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
  Tooltip as RechartsTooltip
} from "recharts";
import { useState } from "react";

function AssetCard({ title, value, pct, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{eur(value)}</div>
      <div className="mt-1 text-sm text-slate-600">
        {pct01(pct)} of total assets {sub ? <span className="text-slate-500">• {sub}</span> : null}
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.round((pct || 0) * 100)}%` }} />
      </div>
    </div>
  );
}

export default function Portfolio() {
  const q = usePortfolio();
  const [scenarioAmount, setScenarioAmount] = useState("");

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

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-semibold text-slate-900">Portfolio</div>
        <div className="text-sm text-slate-600">
          Asset balances are derived from transactions. Targets below are configurable in code.
        </div>
      </div>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Target vs Actual Allocation</div>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              Scenario: move from Bank to MMF
            </div>
            <div className="mt-3 text-sm text-slate-600">
              Quickly explore what happens if you deploy an additional amount from the bank account into
              the MMF investment. This is a front‑end only simulation and does not post any transaction.
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Asset Snapshot</div>
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

