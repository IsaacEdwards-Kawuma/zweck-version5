import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageHero, { SectionTitle } from "../components/PageHero";
import MetricCard from "../components/MetricCard";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import {
  IconBank,
  IconBolt,
  IconBuilding,
  IconCalendar,
  IconClipboard,
  IconListNumbers,
  IconPostTx,
  IconPortfolio,
  IconReports,
  IconScale,
  IconSparkles,
  IconUsers,
  IconWallet
} from "../components/Icons";
import { eur, fmtDate, formatMoney } from "../lib/format";
import {
  useBalances,
  useInvoiceMetrics,
  usePortfolio,
  useSummary,
  useTransactionsList
} from "../hooks/useDashboard";
import { listInternalForms } from "../api/internalForms";
import { listMeetings } from "../api/meetings";
import { listNotifications } from "../api/notifications";

function formKindLabel(kind) {
  switch (kind) {
    case "REQUISITION":
      return "Requisition";
    case "TRANSACTION_RECEIPT":
      return "Expense / receipt";
    case "GENERAL_REQUEST":
      return "General request";
    case "ACKNOWLEDGEMENT":
      return "Acknowledgement";
    default:
      return kind || "Form";
  }
}

const QUICK = [
  { to: "/post", label: "Post transaction", desc: "Journal entries & receipts", icon: IconPostTx, accent: "from-emerald-500/15 to-transparent" },
  { to: "/ledger", label: "Ledger", desc: "Full transaction register", icon: IconListNumbers, accent: "from-sky-500/15 to-transparent" },
  { to: "/reconciliation", label: "Reconciliation", desc: "Bank & control accounts", icon: IconClipboard, accent: "from-cyan-500/12 to-transparent" },
  { to: "/accounts", label: "Chart of accounts", desc: "GL structure & balances", icon: IconReports, accent: "from-indigo-500/12 to-transparent" },
  { to: "/reports", label: "Reports", desc: "P&L, balance sheet, exports", icon: IconReports, accent: "from-violet-500/12 to-transparent" },
  { to: "/portfolio", label: "Portfolio", desc: "Assets & director equity", icon: IconPortfolio, accent: "from-amber-500/15 to-transparent" },
  { to: "/directors", label: "Directors", desc: "Profiles & capital", icon: IconUsers, accent: "from-teal-500/12 to-transparent" },
  { to: "/invoices", label: "Invoices", desc: "AR/AP & billing", icon: IconClipboard, accent: "from-fuchsia-500/12 to-transparent" },
  { to: "/projects", label: "Projects", desc: "MMF / YPA & tasks", icon: IconClipboard, accent: "from-rose-500/12 to-transparent" },
  { to: "/forms", label: "Internal forms", desc: "Approve requisitions & receipts", icon: IconClipboard, accent: "from-orange-500/15 to-transparent" },
  { to: "/meetings", label: "Meetings", desc: "Calendar & materials", icon: IconCalendar, accent: "from-yellow-500/12 to-transparent" },
  { to: "/documents", label: "Documents", desc: "Company register", icon: IconClipboard, accent: "from-green-500/12 to-transparent" },
  { to: "/chat", label: "Chat", desc: "Team messages", icon: IconUsers, accent: "from-blue-500/15 to-transparent" },
  { to: "/notifications", label: "Notifications", desc: "Alerts inbox", icon: IconBolt, accent: "from-red-500/12 to-transparent" },
  { to: "/settings", label: "Settings", desc: "Profile & preferences", icon: IconSparkles, accent: "from-slate-500/12 to-transparent" }
];

export default function TreasurerDashboard() {
  const [tick, setTick] = useState(0);

  const qBalances = useBalances();
  const qSummary = useSummary();
  const qPortfolio = usePortfolio();
  const qTx = useTransactionsList();
  const qInvoiceM = useInvoiceMetrics();
  const qForms = useQuery({
    queryKey: ["internal-forms", { status: "PENDING", treasurer: true }],
    queryFn: () => listInternalForms({ status: "PENDING" })
  });
  const qMeetings = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const qNotifs = useQuery({
    queryKey: ["notifications", "treasurer-head", tick],
    queryFn: () => listNotifications({ limit: 1, unreadOnly: "true" }),
    refetchInterval: 30_000
  });

  const loadingCore =
    qBalances.isLoading || qSummary.isLoading || qPortfolio.isLoading || qTx.isLoading;

  const transactions = useMemo(() => qTx.data ?? [], [qTx.data]);
  const recentTx = useMemo(() => transactions.slice(0, 8), [transactions]);

  const meetings = useMemo(() => (Array.isArray(qMeetings.data) ? qMeetings.data : []), [qMeetings.data]);
  const upcomingMeetings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...meetings]
      .filter((m) => m?.status !== "CANCELLED" && m?.date && String(m.date) >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 4);
  }, [meetings]);

  const pendingForms = useMemo(() => {
    const rows = Array.isArray(qForms.data) ? qForms.data : [];
    return rows.filter((f) => f.status === "PENDING");
  }, [qForms.data]);

  if (loadingCore) return <Loading label="Loading treasurer overview…" />;

  if (qBalances.error) return <ErrorBanner error={qBalances.error} />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qPortfolio.error) return <ErrorBanner error={qPortfolio.error} />;
  if (qTx.error) return <ErrorBanner error={qTx.error} />;

  const balances = qBalances.data;
  const summary = qSummary.data;
  const portfolio = qPortfolio.data;
  const bank =
    balances?.bank ??
    Number(balances?.bank_eur || 0) + Number(balances?.bank_usd || 0) + Number(balances?.bank_ugx || 0);
  const totalAssets = portfolio?.totalAssets || 0;
  const inv = qInvoiceM.data;
  const unread = qNotifs.data?.unreadCount ?? 0;

  return (
    <div className="space-y-8">
      <PageHero
        icon={IconWallet}
        title="Treasurer"
        subtitle="Cash, ledger, reconciliations, invoicing, and internal form approvals — your control tower for company money."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signed in as treasurer. Use the shortcuts below or open any item from the sidebar.
        </p>
        <button
          type="button"
          className="ui-btn-outline text-sm"
          onClick={() => {
            setTick((t) => t + 1);
            qForms.refetch();
            qMeetings.refetch();
            qNotifs.refetch();
            qInvoiceM.refetch();
          }}
        >
          Refresh data
        </button>
      </div>

      <div className="ui-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Bank (aggregated)" value={eur(bank)} icon={IconBank} />
        <MetricCard label="Total assets" value={eur(totalAssets)} sub="From portfolio view" icon={IconBuilding} />
        <MetricCard
          label="Income / expense / net"
          value={
            summary
              ? `${eur(summary.income || 0)} / ${eur(summary.expenses || 0)} / ${eur(summary.net || 0)}`
              : "—"
          }
          sub="All-time from summary"
          icon={IconScale}
        />
        <MetricCard
          label="Pending forms"
          value={String(pendingForms.length)}
          sub="Awaiting treasurer or admin decision"
          icon={IconClipboard}
        />
      </div>

      <div className="ui-stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Sales receivable"
          value={inv ? formatMoney(inv.totalReceivable || 0, "EUR") : qInvoiceM.isError ? "—" : "…"}
          icon={IconWallet}
        />
        <MetricCard
          label="Purchase payable"
          value={inv ? formatMoney(inv.totalPayable || 0, "EUR") : qInvoiceM.isError ? "—" : "…"}
          icon={IconWallet}
        />
        <MetricCard
          label="Overdue invoices"
          value={inv ? String(inv.overdueCount ?? 0) : qInvoiceM.isError ? "—" : "…"}
          sub={inv ? formatMoney(inv.overdueValue || 0, "EUR") : null}
          icon={IconListNumbers}
        />
      </div>

      <div className="ui-stagger grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle icon={IconSparkles}>Workspace</SectionTitle>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Core treasury and accounting tools. Same routes as the main dashboard, grouped for speed.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {QUICK.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  "group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/80",
                  "bg-gradient-to-br",
                  item.accent
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-white/80 p-2 text-brand-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-brand-300 dark:ring-slate-600">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</div>
                    <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle icon={IconBolt}>Alerts</SectionTitle>
              <Link to="/notifications" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Open inbox
              </Link>
            </div>
            <div className="mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{unread}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Unread notifications</div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <div className="flex items-center justify-between gap-2">
              <SectionTitle icon={IconCalendar}>Next meetings</SectionTitle>
              <Link to="/meetings" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                All
              </Link>
            </div>
            {qMeetings.isLoading ? (
              <div className="mt-3 text-sm text-slate-500">Loading…</div>
            ) : upcomingMeetings.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No upcoming meetings on file.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {upcomingMeetings.map((m) => (
                  <li key={m.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{m.title}</div>
                    <div className="text-xs text-slate-500">
                      {m.date}
                      {m.time ? ` · ${m.time}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-slate-900/90">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={IconClipboard}>Pending approvals</SectionTitle>
            <Link to="/forms" className="text-sm font-semibold text-amber-900 hover:underline dark:text-amber-200">
              Review queue →
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Requisitions, expense/receipt packages, and other internal forms waiting on a treasurer or admin decision.
          </p>
          {qForms.isLoading ? (
            <div className="mt-4 text-sm text-slate-500">Loading forms…</div>
          ) : qForms.isError ? (
            <div className="mt-4 text-sm text-rose-600">Could not load forms.</div>
          ) : pendingForms.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">No pending forms — you&apos;re caught up.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {pendingForms.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <Link
                    to="/forms"
                    className="flex flex-col rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-left transition hover:border-amber-300 dark:border-slate-700 dark:bg-slate-950/50 dark:hover:border-amber-700"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      {formKindLabel(f.kind)}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{f.title}</span>
                    <span className="text-xs text-slate-500">
                      {f.requestedBy?.email || "—"}
                      {f.amount != null && f.currency ? ` · ${f.amount} ${f.currency}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={IconListNumbers}>Recent ledger activity</SectionTitle>
            <Link to="/ledger" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Full ledger →
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Latest posted movements (by date).</p>
          <ul className="mt-4 space-y-2">
            {recentTx.map((t) => (
              <li
                key={t.id ?? `${t.referenceNumber}-${t.date}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-200">{t.type || "—"}</div>
                  <div className="text-xs text-slate-500">{fmtDate(t.date)} · {t.referenceNumber || "—"}</div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {eur(t.amount)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
