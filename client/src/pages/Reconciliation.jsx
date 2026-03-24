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

export default function Reconciliation() {
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [openingBalance, setOpeningBalance] = useState("");
  const [statementEndingBalance, setStatementEndingBalance] = useState("");

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
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = Number(openingBalance || 0);
    return bankTx.map((t) => {
      running += t.delta;
      return { ...t, runningAfter: running };
    });
  }, [qPeriod.data, openingBalance]);

  const periodMovement = useMemo(
    () => periodRows.reduce((sum, t) => sum + t.delta, 0),
    [periodRows]
  );

  const opening = Number(openingBalance || 0);
  const statementEnding = Number(statementEndingBalance || 0);
  const expectedFromPeriod = opening + periodMovement;
  const varianceVsStatement = statementEndingBalance === "" ? 0 : statementEnding - expectedFromPeriod;
  const varianceVsLedger = statementEndingBalance === "" ? 0 : statementEnding - ledgerBankBalanceToDate;

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
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
      </div>

      <div className="rounded-xl ui-surface p-4">
        <div className="mb-2 text-sm font-semibold ui-page-heading">Bank-impact transactions in selected period</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="ui-table-head">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Delta</th>
                <th className="px-3 py-2 text-right">Running (from opening)</th>
              </tr>
            </thead>
            <tbody className="ui-table-divide">
              {periodRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">{r.type}</td>
                  <td className="px-3 py-2">{r.description || "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{eur(r.delta)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{eur(r.runningAfter)}</td>
                </tr>
              ))}
              {periodRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
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

