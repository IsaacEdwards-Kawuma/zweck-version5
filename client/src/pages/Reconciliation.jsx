import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listTransactions } from "../api/transactions";
import { eur, fmtDate } from "../lib/format";

const BANK_EFFECT = {
  CONTRIBUTION: 1,
  SIDE_FUND: 1,
  PENALTY: 1,
  LOAN_IN: 1,
  REGISTRATION: -1,
  TX_CHARGE: -1,
  LEGAL: -1,
  OTHER_OUT: -1
};
const STORAGE_KEY = "zweck_reconciliation_notes_v1";

function toIsoEndOfDay(yyyyMmDd) {
  if (!yyyyMmDd) return undefined;
  return new Date(`${yyyyMmDd}T23:59:59.999Z`).toISOString();
}

function toIsoStartOfDay(yyyyMmDd) {
  if (!yyyyMmDd) return undefined;
  return new Date(`${yyyyMmDd}T00:00:00.000Z`).toISOString();
}

function bankDelta(tx) {
  const dir = BANK_EFFECT[tx.type];
  if (!dir) return 0;
  return dir * (Number(tx.amount) || 0);
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSaved(next) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function keyFor(from, to) {
  return `${from || "none"}__${to || "none"}`;
}

export default function Reconciliation() {
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [openingBalance, setOpeningBalance] = useState("");
  const [statementEndingBalance, setStatementEndingBalance] = useState("");
  const [bankFees, setBankFees] = useState("");
  const [interestAdjustments, setInterestAdjustments] = useState("");
  const [otherAdjustments, setOtherAdjustments] = useState("");
  const [txQuery, setTxQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [onlyUncleared, setOnlyUncleared] = useState(false);
  const [savedByPeriod, setSavedByPeriod] = useState(() => loadSaved());

  const qLedgerToDate = useQuery({
    queryKey: ["transactions", "recon", "to-date", statementDate],
    queryFn: () =>
      listTransactions({
        to: statementDate ? statementDate : undefined
      })
  });

  const qPeriod = useQuery({
    queryKey: ["transactions", "recon", "period", periodFrom, statementDate],
    queryFn: () =>
      listTransactions({
        from: periodFrom || undefined,
        to: statementDate || undefined
      })
  });

  const ledgerBankBalanceToDate = useMemo(() => {
    const txs = qLedgerToDate.data || [];
    return txs.reduce((sum, t) => sum + bankDelta(t), 0);
  }, [qLedgerToDate.data]);

  const periodRows = useMemo(() => {
    const txs = qPeriod.data || [];
    const bankTx = txs
      .map((t) => ({ ...t, delta: bankDelta(t) }))
      .filter((t) => t.delta !== 0)
      .filter((t) => {
        if (!txQuery.trim()) return true;
        const hay = `${t.type} ${t.description || ""}`.toLowerCase();
        return hay.includes(txQuery.toLowerCase().trim());
      })
      .filter((t) => {
        if (directionFilter === "ALL") return true;
        if (directionFilter === "IN") return t.delta > 0;
        if (directionFilter === "OUT") return t.delta < 0;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = Number(openingBalance || 0);
    return bankTx.map((t) => {
      running += t.delta;
      return { ...t, runningAfter: running, cleared: Boolean(getSavedForPeriod().cleared?.[t.id]) };
    });
  }, [qPeriod.data, openingBalance, txQuery, directionFilter, savedByPeriod, periodFrom, statementDate]);

  const visibleRows = useMemo(() => {
    return onlyUncleared ? periodRows.filter((r) => !r.cleared) : periodRows;
  }, [periodRows, onlyUncleared]);

  const periodMovement = useMemo(
    () => visibleRows.reduce((sum, t) => sum + t.delta, 0),
    [visibleRows]
  );

  const opening = Number(openingBalance || 0);
  const totalAdjustments = Number(bankFees || 0) + Number(interestAdjustments || 0) + Number(otherAdjustments || 0);
  const statementEnding = Number(statementEndingBalance || 0);
  const expectedFromPeriod = opening + periodMovement + totalAdjustments;
  const varianceVsStatement = statementEndingBalance === "" ? 0 : statementEnding - expectedFromPeriod;
  const varianceVsLedger = statementEndingBalance === "" ? 0 : statementEnding - ledgerBankBalanceToDate;
  const clearedCount = periodRows.filter((r) => r.cleared).length;
  const unclearedCount = periodRows.length - clearedCount;
  const clearanceRate = periodRows.length ? Math.round((clearedCount / periodRows.length) * 100) : 0;

  function getSavedForPeriod() {
    return savedByPeriod[keyFor(periodFrom, statementDate)] || { notes: "", cleared: {} };
  }

  function updateSavedForPeriod(updater) {
    const k = keyFor(periodFrom, statementDate);
    setSavedByPeriod((prev) => {
      const current = prev[k] || { notes: "", cleared: {} };
      const next = { ...prev, [k]: updater(current) };
      saveSaved(next);
      return next;
    });
  }

  function toggleCleared(id) {
    updateSavedForPeriod((current) => ({
      ...current,
      cleared: { ...current.cleared, [id]: !current.cleared?.[id] }
    }));
  }

  function setAllVisibleCleared(value) {
    updateSavedForPeriod((current) => {
      const nextCleared = { ...(current.cleared || {}) };
      visibleRows.forEach((r) => {
        nextCleared[r.id] = value;
      });
      return { ...current, cleared: nextCleared };
    });
  }

  function exportCsv() {
    const rows = visibleRows;
    const headers = ["date", "type", "description", "delta", "runningAfter", "cleared"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        [esc(fmtDate(r.date)), esc(r.type), esc(r.description || ""), esc(r.delta), esc(r.runningAfter), esc(r.cleared ? "YES" : "NO")].join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${periodFrom || "start"}-to-${statementDate || "end"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (qLedgerToDate.isLoading || qPeriod.isLoading) return <Loading label="Loading reconciliation..." />;
  if (qLedgerToDate.error) return <ErrorBanner error={qLedgerToDate.error} />;
  if (qPeriod.error) return <ErrorBanner error={qPeriod.error} />;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-lg font-semibold ui-page-heading">Bank Reconciliation</div>
        <div className="text-sm ui-body-text">
          Compare statement balances against ledger-derived bank movements to confirm period reconciliation.
        </div>
      </div>

      <div className="rounded-xl ui-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-slate-700">Period start</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border-slate-300"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Statement date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border-slate-300"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Opening balance</label>
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border-slate-300"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Statement ending balance</label>
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border-slate-300"
              placeholder="0.00"
              value={statementEndingBalance}
              onChange={(e) => setStatementEndingBalance(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-700">Bank fees adjustment (negative)</label>
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border-slate-300"
              placeholder="0.00"
              value={bankFees}
              onChange={(e) => setBankFees(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Interest adjustment (positive)</label>
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border-slate-300"
              placeholder="0.00"
              value={interestAdjustments}
              onChange={(e) => setInterestAdjustments(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">Other adjustment (+/-)</label>
            <input
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border-slate-300"
              placeholder="0.00"
              value={otherAdjustments}
              onChange={(e) => setOtherAdjustments(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide ui-page-muted">Ledger bank balance (to date)</div>
          <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(ledgerBankBalanceToDate)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide ui-page-muted">Period net movement</div>
          <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(periodMovement)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide ui-page-muted">Expected from period</div>
          <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(expectedFromPeriod)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide ui-page-muted">Variance vs statement</div>
          <div
            className={[
              "mt-1 text-xl font-semibold",
              Math.abs(varianceVsStatement) < 0.005 ? "text-emerald-700" : "text-rose-700"
            ].join(" ")}
          >
            {eur(varianceVsStatement)}
          </div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide ui-page-muted">Adjustments total</div>
          <div className="mt-1 text-xl font-semibold ui-page-heading">{eur(totalAdjustments)}</div>
        </div>
        <div className="rounded-xl ui-surface p-4">
          <div className="text-xs uppercase tracking-wide ui-page-muted">Cleared / uncleared</div>
          <div className="mt-1 text-xl font-semibold ui-page-heading">
            {clearedCount}/{unclearedCount}
          </div>
          <div className="text-xs ui-page-muted">{clearanceRate}% cleared</div>
        </div>
      </div>

      <div className="rounded-xl ui-surface p-4">
        <div className="text-sm font-semibold ui-page-heading">Reconciliation status</div>
        <div className="mt-2 text-sm ui-body-text">
          {statementEndingBalance === ""
            ? "Enter statement ending balance to compute variance."
            : Math.abs(varianceVsStatement) < 0.005
            ? "Reconciled: statement matches ledger movement for the selected period."
            : "Not reconciled: investigate missing, duplicated, or misclassified transactions."}
        </div>
        {statementEndingBalance !== "" ? (
          <div className="mt-2 text-xs ui-page-muted">
            Statement vs ledger-to-date variance: <span className="font-semibold">{eur(varianceVsLedger)}</span>
          </div>
        ) : null}
        <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wide ui-page-muted">Reconciliation notes</div>
          <textarea
            className="mt-2 w-full rounded-lg border-slate-300 text-sm"
            rows={3}
            value={getSavedForPeriod().notes || ""}
            onChange={(e) =>
              updateSavedForPeriod((current) => ({
                ...current,
                notes: e.target.value
              }))
            }
            placeholder="Document exceptions, follow-up items, and approvals."
          />
        </div>
      </div>

      <div className="rounded-xl ui-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold ui-page-heading">Bank-impact transactions in selected period</div>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-lg border-slate-300 px-2 py-1.5 text-sm"
              placeholder="Search type/description..."
              value={txQuery}
              onChange={(e) => setTxQuery(e.target.value)}
            />
            <select className="rounded-lg border-slate-300 px-2 py-1.5 text-sm" value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
              <option value="ALL">All movement</option>
              <option value="IN">Inflows only</option>
              <option value="OUT">Outflows only</option>
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              <input type="checkbox" checked={onlyUncleared} onChange={(e) => setOnlyUncleared(e.target.checked)} />
              Uncleared only
            </label>
            <button type="button" className="ui-btn-outline-xs" onClick={() => setAllVisibleCleared(true)}>
              Mark visible cleared
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => setAllVisibleCleared(false)}>
              Mark visible uncleared
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Delta</th>
                <th className="px-3 py-2 text-right">Running (from opening)</th>
                <th className="px-3 py-2 text-center">Cleared</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">{r.type}</td>
                  <td className="px-3 py-2">{r.description || "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{eur(r.delta)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{eur(r.runningAfter)}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={r.cleared} onChange={() => toggleCleared(r.id)} />
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-slate-500">
                    No bank-impact transactions in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

