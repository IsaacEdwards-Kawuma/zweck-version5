import { Link } from "react-router-dom";
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionTitle } from "../components/PageHero";
import MetricCard from "../components/MetricCard";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import {
  IconBank,
  IconBolt,
  IconBuilding,
  IconChartPie,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconDashboard,
  IconListNumbers,
  IconPostTx,
  IconRadar,
  IconScale,
  IconSettings,
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

/** Floating coins / rings — purely decorative. */
function TreasurerFloatingDeco() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      <div
        className="treasurer-deco-float treasurer-deco-float-d1 absolute left-[6%] top-[14%] h-12 w-12 rounded-full bg-gradient-to-br from-emerald-400/35 to-teal-600/25 shadow-lg shadow-emerald-600/15 ring-2 ring-white/60 dark:ring-emerald-500/20"
      />
      <div
        className="treasurer-deco-float treasurer-deco-float-d2 absolute right-[10%] top-[22%] h-9 w-9 rounded-full bg-gradient-to-br from-amber-300/45 to-amber-600/30 ring-2 ring-amber-200/50 dark:ring-amber-500/25"
      />
      <div
        className="treasurer-deco-float treasurer-deco-float-d3 absolute bottom-[18%] left-[18%] h-7 w-7 rounded-full bg-gradient-to-br from-sky-400/35 to-blue-600/25 ring-2 ring-sky-200/40 dark:ring-sky-500/20"
      />
      <svg
        className="treasurer-deco-float treasurer-deco-float-d2 absolute -right-4 bottom-[8%] h-20 w-20 text-emerald-500/25 dark:text-emerald-400/20"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
      >
        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" strokeDasharray="6 8" />
        <path d="M32 12v40M20 28h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  );
}

/** Soft wave between major sections. */
function TreasurerSectionWave() {
  return (
    <div className="relative -my-1 h-10 w-full overflow-hidden text-emerald-500/25 dark:text-emerald-500/15" aria-hidden>
      <svg
        className="treasurer-wave-anim h-full w-full"
        viewBox="0 0 1200 40"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          d="M0,20 C150,5 350,35 600,18 C850,2 1050,38 1200,22 L1200,40 L0,40 Z"
          opacity="0.65"
        />
        <path
          fill="currentColor"
          d="M0,28 C180,12 380,36 600,24 C820,10 1020,34 1200,26 L1200,40 L0,40 Z"
          opacity="0.35"
        />
      </svg>
    </div>
  );
}

/** Narrow finance motif for “Treasury focus” panel. */
function TreasurerFocusSideGraphic({ className = "" }) {
  const gid = useId().replace(/:/g, "");
  const g = `trs-focus-grad-${gid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 120 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="120" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x="24" y="16" width="72" height="96" rx="10" stroke={`url(#${g})`} strokeWidth="2" opacity="0.8" />
      <path d="M40 44h48M40 60h36M40 76h44" stroke="#10b981" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <circle cx="60" cy="120" r="28" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 6" opacity="0.45" />
      <path d="M52 120l6 6 14-16" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="36" y="152" width="48" height="8" rx="2" fill="#10b981" opacity="0.2" />
      <rect x="44" y="164" width="32" height="6" rx="2" fill="#3b82f6" opacity="0.15" />
    </svg>
  );
}

/** Inline SVG — vault, trend, and liquidity (no external images). */
function TreasurerHeroIllustration({ className = "" }) {
  const gid = useId().replace(/:/g, "");
  const grad = `trs-grad-${gid}`;
  const gold = `trs-gold-${gid}`;
  const blur = `trs-blur-${gid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 400 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={grad} x1="40" y1="30" x2="340" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#059669" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#0d9488" stopOpacity="0.85" />
          <stop offset="1" stopColor="#2563eb" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d97706" stopOpacity="0.75" />
        </linearGradient>
        <filter id={blur} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <ellipse cx="200" cy="228" rx="150" ry="9" fill={`url(#${grad})`} opacity="0.25" filter={`url(#${blur})`} />
      <rect x="48" y="40" width="220" height="150" rx="16" fill="white" className="dark:fill-slate-800" opacity="0.96" />
      <rect x="48" y="40" width="220" height="150" rx="16" stroke={`url(#${grad})`} strokeWidth="2" />
      <path
        d="M72 168V88h32l16 24 20-24h36v80"
        stroke="currentColor"
        className="text-emerald-200 dark:text-emerald-800"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      />
      <path d="M88 152l28-36 24 20 32-48 28 40" stroke={`url(#${grad})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="88" cy="152" r="4" fill="#059669" />
      <circle cx="116" cy="116" r="4" fill="#0d9488" />
      <circle cx="140" cy="136" r="4" fill="#14b8a6" />
      <circle cx="172" cy="88" r="4" fill="#2563eb" />
      <circle cx="200" cy="128" r="4" fill="#059669" />
      <rect x="260" y="56" width="92" height="72" rx="10" fill="white" className="dark:fill-slate-900" stroke="#fbbf24" strokeWidth="2" opacity="0.95" />
      <circle cx="292" cy="88" r="18" fill={`url(#${gold})`} opacity="0.35" />
      <g className="text-amber-800 dark:text-amber-200">
        <text x="284" y="94" fill="currentColor" fontSize="22" fontWeight="700" fontFamily="system-ui, sans-serif">
          €
        </text>
      </g>
      <path
        d="M272 118h68M272 130h52"
        stroke="#b45309"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      <rect x="62" y="56" width="40" height="52" rx="8" fill="#ecfdf5" className="dark:fill-emerald-950/60" stroke="#6ee7b7" strokeWidth="1.5" />
      <circle cx="82" cy="78" r="8" stroke="#059669" strokeWidth="2" fill="none" opacity="0.65" />
      <path d="M78 78l3 3 6-7" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function TreasurerLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="rounded-xl border border-emerald-200/70 bg-white/80 px-4 py-2.5 text-center shadow-sm backdrop-blur-sm dark:border-emerald-800/50 dark:bg-slate-900/75">
      <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
        <IconClock className="h-4 w-4 opacity-80" aria-hidden />
        <span className="font-mono text-lg font-semibold tabular-nums tracking-tight">
          {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

const HERO_BADGES = [
  { label: "Cash & bank", icon: IconBank },
  { label: "Ledger control", icon: IconListNumbers },
  { label: "Approvals", icon: IconCheckCircle },
  { label: "Reporting", icon: IconChartPie }
];

const TREASURY_FOCUS = [
  {
    text: "Reconcile bank and control accounts on your agreed cadence.",
    icon: IconClipboard
  },
  {
    text: "Clear pending forms and post the matching entries in the ledger.",
    icon: IconCheckCircle
  },
  {
    text: "Monitor AR/AP aging and chase overdue invoices proactively.",
    icon: IconWallet
  },
  {
    text: "Ensure reporting and control accounts stay aligned with posted ledger activity.",
    icon: IconScale
  }
];

const QUICK = [
  { to: "/post", label: "Post transaction", desc: "Journal entries & receipts", icon: IconPostTx, accent: "from-emerald-500/15 to-transparent" },
  { to: "/ledger", label: "Ledger", desc: "Full transaction register", icon: IconListNumbers, accent: "from-sky-500/15 to-transparent" },
  { to: "/reconciliation", label: "Reconciliation", desc: "Bank & control accounts", icon: IconClipboard, accent: "from-cyan-500/12 to-transparent" },
  { to: "/accounts", label: "Chart of accounts", desc: "GL structure & balances", icon: IconBuilding, accent: "from-indigo-500/12 to-transparent" },
  { to: "/reports", label: "Reports", desc: "P&L, balance sheet, exports", icon: IconChartPie, accent: "from-violet-500/12 to-transparent" },
  { to: "/invoices", label: "Invoices", desc: "AR/AP & billing", icon: IconWallet, accent: "from-fuchsia-500/12 to-transparent" },
  { to: "/projects", label: "Projects", desc: "MMF / YPA & tasks", icon: IconDashboard, accent: "from-rose-500/12 to-transparent" },
  { to: "/forms", label: "Internal forms", desc: "Approve requisitions & receipts", icon: IconClipboard, accent: "from-orange-500/15 to-transparent" },
  { to: "/chat", label: "Chat", desc: "Team messages", icon: IconUsers, accent: "from-blue-500/15 to-transparent" },
  { to: "/notifications", label: "Notifications", desc: "Alerts inbox", icon: IconBolt, accent: "from-red-500/12 to-transparent" },
  { to: "/help", label: "Help & guides", desc: "Shortcuts and how-tos", icon: IconSparkles, accent: "from-brand-500/15 to-transparent" },
  { to: "/settings", label: "Settings", desc: "Profile & preferences", icon: IconSettings, accent: "from-slate-500/12 to-transparent" }
];

export default function TreasurerDashboard() {
  const [tick, setTick] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const qBalances = useBalances();
  const qSummary = useSummary();
  const qPortfolio = usePortfolio();
  const qTx = useTransactionsList();
  const qInvoiceM = useInvoiceMetrics();
  const qForms = useQuery({
    queryKey: ["internal-forms", { status: "PENDING", treasurer: true }],
    queryFn: () => listInternalForms({ status: "PENDING" })
  });
  const qNotifs = useQuery({
    queryKey: ["notifications", "treasurer-head", tick],
    queryFn: () => listNotifications({ limit: 1, unreadOnly: "true" }),
    refetchInterval: 30_000
  });

  const loadingCore =
    qBalances.isLoading || qSummary.isLoading || qPortfolio.isLoading || qTx.isLoading;

  const transactions = useMemo(() => qTx.data ?? [], [qTx.data]);
  const recentTx = useMemo(() => transactions.slice(0, 8), [transactions]);

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
  const overdueN = inv ? Number(inv.overdueCount ?? 0) : 0;

  const refreshAll = () => {
    setTick((t) => t + 1);
    setLastRefreshAt(new Date().toLocaleString());
    qForms.refetch();
    qNotifs.refetch();
    qInvoiceM.refetch();
  };

  return (
    <div className="space-y-8">
      {/* Hero — finance gradient, illustration, live clock */}
      <div className="ui-animate-in relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/50 p-6 shadow-md shadow-emerald-500/5 dark:border-emerald-900/40 dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900 dark:shadow-none">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 treasurer-shimmer-bar opacity-95" aria-hidden />
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-sky-400/15 blur-2xl dark:bg-sky-500/10"
          aria-hidden
        />
        <TreasurerFloatingDeco />

        <div className="relative grid gap-8 lg:grid-cols-[1fr_minmax(0,300px)] lg:items-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25 ring-4 ring-emerald-500/15 dark:ring-emerald-400/10">
              <IconWallet className="h-8 w-8" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Treasurer</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Cash, ledger, reconciliations, invoicing, and internal form approvals — your control tower for company
                money.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {HERO_BADGES.map((badge) => {
                  const BadgeIcon = badge.icon;
                  return (
                    <span
                      key={badge.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100"
                    >
                      <BadgeIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      {badge.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-end lg:flex-col lg:items-end">
            <TreasurerHeroIllustration className="treasurer-hero-art-float h-40 w-full max-w-[280px] opacity-[0.97] sm:h-44" />
            <TreasurerLiveClock />
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
        <IconSparkles className="pointer-events-none absolute -left-1 bottom-0 h-24 w-24 text-emerald-500/[0.12] dark:text-emerald-400/[0.1]" aria-hidden />
        <p className="relative z-10 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400 sm:items-center">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-700 dark:text-emerald-300">
            <IconRadar className="h-4 w-4" aria-hidden />
          </span>
          <span>
          <span className="font-medium text-slate-800 dark:text-slate-200">Workspace overview</span>
          — use shortcuts below or the sidebar. Data refreshes automatically; you can force a sync anytime.
          </span>
        </p>
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          {lastRefreshAt ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Last manual sync: <span className="font-medium text-slate-700 dark:text-slate-300">{lastRefreshAt}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">Tip: tap refresh after posting or approvals.</span>
          )}
          <button type="button" className="ui-btn-outline text-sm" onClick={refreshAll}>
            Refresh data
          </button>
        </div>
      </div>

      {/* Treasury focus — professional checklist */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 to-white p-5 shadow-sm dark:border-emerald-900/35 dark:from-emerald-950/20 dark:to-slate-900/90">
        <TreasurerFocusSideGraphic className="pointer-events-none absolute -bottom-2 right-0 hidden h-44 w-28 opacity-90 md:block lg:h-52 lg:w-32" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(16,185,129,0.08),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_30%_20%,rgba(52,211,153,0.06),transparent_50%)]" aria-hidden />
        <div className="relative z-10">
        <SectionTitle icon={IconRadar}>Treasury focus</SectionTitle>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Short reminders to keep finance operations tight and audit-ready.
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {TREASURY_FOCUS.map((row) => {
            const RowIcon = row.icon;
            return (
              <li
                key={row.text}
                className="flex gap-3 rounded-xl border border-emerald-100/90 bg-white/90 p-3.5 shadow-sm transition hover:border-emerald-300/80 hover:shadow-md dark:border-emerald-900/40 dark:bg-slate-950/50 dark:hover:border-emerald-700/50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 text-emerald-700 dark:text-emerald-300">
                  <RowIcon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm leading-snug text-slate-700 dark:text-slate-200">{row.text}</span>
              </li>
            );
          })}
        </ul>
        </div>
      </div>

      <TreasurerSectionWave />

      <div className="treasurer-metrics-shell treasurer-dot-noise p-5 sm:p-6">
        <div
          className="pointer-events-none absolute -left-16 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/10"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl dark:bg-sky-500/10"
          aria-hidden
        />
        <div className="relative space-y-8">
      <div className="ui-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Bank (aggregated)" value={eur(bank)} icon={IconBank} />
        <MetricCard label="Total assets" value={eur(totalAssets)} sub="From portfolio view" icon={IconBuilding} />
        <MetricCard
          label="Income / expense / net"
          value={
            summary ? `${eur(summary.income || 0)} / ${eur(summary.expenses || 0)} / ${eur(summary.net || 0)}` : "—"
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
        <div className={overdueN > 0 ? "treasurer-overdue-pulse" : ""}>
          <MetricCard
            label="Overdue invoices"
            value={inv ? String(inv.overdueCount ?? 0) : qInvoiceM.isError ? "—" : "…"}
            sub={inv ? formatMoney(inv.overdueValue || 0, "EUR") : null}
            icon={IconListNumbers}
          />
        </div>
      </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="treasurer-workspace-shell lg:col-span-2">
          <div className="relative overflow-hidden rounded-xl bg-white/90 p-4 dark:bg-slate-900/70 sm:p-5">
            <IconChartPie className="pointer-events-none absolute -bottom-6 -right-4 h-48 w-48 text-emerald-600/[0.07] dark:text-emerald-400/[0.09]" aria-hidden />
            <IconBank className="pointer-events-none absolute -left-4 top-4 h-28 w-28 -rotate-12 text-sky-600/[0.06] dark:text-sky-400/[0.08]" aria-hidden />
          <div className="relative z-10">
          <SectionTitle icon={IconSparkles}>Workspace</SectionTitle>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Core treasury and accounting tools. Same routes as the main dashboard, grouped for speed.
          </p>
          <div className="treasurer-stagger-in mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {QUICK.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    "treasurer-quick-card group relative overflow-hidden p-4",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
                    "bg-gradient-to-br",
                    item.accent
                  ].join(" ")}
                >
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/40 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100 dark:bg-emerald-500/10" />
                  <div className="relative flex items-start gap-3">
                    <span className="treasurer-card-icon-motion rounded-xl bg-gradient-to-br from-emerald-600/90 to-teal-600/90 p-2.5 text-white shadow-md shadow-emerald-600/20 ring-2 ring-white/50 dark:ring-slate-800/80">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</div>
                      <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.desc}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          </div>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className={[
              "treasurer-side-panel-shell p-4",
              unread > 0 ? "treasurer-alert-live border-emerald-300/60 dark:border-emerald-700/50" : ""
            ].join(" ")}
          >
            <IconBolt className="pointer-events-none absolute right-3 top-3 h-24 w-24 text-amber-500/[0.08] dark:text-amber-400/[0.1]" aria-hidden />
            <div className="relative flex items-center justify-between gap-2">
              <SectionTitle icon={IconBolt}>Alerts</SectionTitle>
              <Link to="/notifications" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
                Open inbox
              </Link>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{unread}</span>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">unread</span>
            </div>
            <div className="relative text-xs text-slate-500 dark:text-slate-400">Notifications across ledger, forms, and billing.</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-slate-900/90">
          <IconClipboard className="pointer-events-none absolute -right-3 -top-2 h-36 w-36 text-amber-600/[0.09] dark:text-amber-400/[0.1]" aria-hidden />
          <div className="relative z-10">
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
                    className="flex flex-col rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-left transition duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-950/50 dark:hover:border-amber-700"
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
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <IconListNumbers className="pointer-events-none absolute -bottom-4 -right-2 h-40 w-40 text-emerald-600/[0.06] dark:text-emerald-400/[0.08]" aria-hidden />
          <div className="relative z-10">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={IconListNumbers}>Recent ledger activity</SectionTitle>
            <Link to="/ledger" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              Full ledger →
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Latest posted movements (by date).</p>
          <ul className="mt-4 space-y-2">
            {recentTx.map((t, idx) => (
              <li
                key={t.id ?? `${t.referenceNumber}-${t.date}`}
                style={{ animationDelay: `${idx * 40}ms` }}
                className="ui-animate-in flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-200">{t.type || "—"}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(t.date)} · {t.referenceNumber || "—"}
                  </div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{eur(t.amount)}</div>
              </li>
            ))}
          </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
