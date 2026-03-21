import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import TransactionTable from "../components/TransactionTable";
import { getDirector } from "../api/directors";
import { directorAccount } from "../api/accounts";
import { eur } from "../lib/format";

export default function DirectorDetail() {
  const { id } = useParams();
  const qProfile = useQuery({ queryKey: ["director", id], queryFn: () => getDirector(id) });
  const qTotals = useQuery({ queryKey: ["director_account", id], queryFn: () => directorAccount(id) });

  if (qProfile.isLoading || qTotals.isLoading) return <Loading label="Loading director..." />;
  if (qProfile.error) return <ErrorBanner error={qProfile.error} />;
  if (qTotals.error) return <ErrorBanner error={qTotals.error} />;

  const { director, transactions } = qProfile.data;
  const totals = qTotals.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-900">{director.name}</div>
          <div className="text-sm text-slate-600">{director.email}</div>
        </div>
        <Link to="/directors" className="text-sm font-medium text-brand-700 hover:underline">
          Back to directors
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Capital</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.capital || 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Side Fund</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.sideFund || 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-semibold">{eur(totals.total || 0)}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Contribution History</div>
        <TransactionTable rows={transactions || []} />
      </div>
    </div>
  );
}

