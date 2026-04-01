import { Link, useOutletContext } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionTitle } from "../components/PageHero";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import {
  IconBolt,
  IconCalendar,
  IconCheckCircle,
  IconClipboard,
  IconClock,
  IconPostTx,
  IconReports,
  IconSparkles,
  IconUsers
} from "../components/Icons";
import { getSettings } from "../api/settings";
import { getAboutPage } from "../api/aboutPage";
import { listDocuments } from "../api/documents";
import { listMeetings } from "../api/meetings";
import { listChatRooms } from "../api/chat";
import { listNotifications } from "../api/notifications";
import { listInternalForms } from "../api/internalForms";
import { notificationKindLabel } from "../lib/notificationLabels";

function minutesUntil(ts) {
  if (!Number.isFinite(ts)) return null;
  return Math.floor((ts - Date.now()) / 60000);
}

function addDaysKey(base, days) {
  const t = new Date(`${base}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function daysUntilDate(iso) {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((t - start) / 86400000);
}

/** Decorative SVG — governance, records, and schedule (inline, no external assets). */
function SecretaryHeroIllustration({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 420 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="sec-grad-a" x1="60" y1="40" x2="360" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3563ae" stopOpacity="0.95" />
          <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="sec-grad-b" x1="200" y1="20" x2="400" y2="180" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c9a227" stopOpacity="0.35" />
          <stop offset="1" stopColor="#3563ae" stopOpacity="0.15" />
        </linearGradient>
        <filter id="sec-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" />
        </filter>
      </defs>
      <ellipse cx="210" cy="248" rx="160" ry="10" fill="url(#sec-grad-b)" opacity="0.45" filter="url(#sec-blur)" />
      <rect x="88" y="48" width="200" height="150" rx="14" fill="white" className="dark:fill-slate-800" opacity="0.95" />
      <rect x="88" y="48" width="200" height="150" rx="14" stroke="url(#sec-grad-a)" strokeWidth="2.2" />
      <path
        d="M108 78h160M108 98h120M108 118h140M108 138h100"
        stroke="currentColor"
        className="text-brand-200 dark:text-slate-600"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <rect x="108" y="158" width="56" height="14" rx="4" fill="#3563ae" opacity="0.35" />
      <rect x="172" y="158" width="76" height="14" rx="4" fill="#0ea5e9" opacity="0.28" />
      <circle cx="320" cy="72" r="36" fill="url(#sec-grad-a)" opacity="0.2" />
      <circle cx="320" cy="72" r="28" stroke="url(#sec-grad-a)" strokeWidth="2.5" fill="white" className="dark:fill-slate-900" />
      <path
        d="M308 72l8 8 18-20"
        stroke="#3563ae"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect x="52" y="92" width="44" height="56" rx="6" fill="#eef4fb" className="dark:fill-slate-700/80" stroke="#b7cdea" strokeWidth="1.5" />
      <rect x="60" y="102" width="28" height="4" rx="1" fill="#3563ae" opacity="0.35" />
      <rect x="60" y="112" width="22" height="4" rx="1" fill="#3563ae" opacity="0.22" />
      <path d="M58 128h32" stroke="#3563ae" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <rect x="324" y="120" width="52" height="68" rx="8" fill="white" className="dark:fill-slate-800" stroke="#c9a227" strokeWidth="1.8" opacity="0.95" />
      <path d="M336 138h28M336 152h22M336 166h26" stroke="#ae8920" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
      <circle cx="350" cy="188" r="5" fill="#c9a227" opacity="0.65" />
    </svg>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-center shadow-sm backdrop-blur-sm dark:border-slate-600/60 dark:bg-slate-900/70">
      <div className="font-mono text-lg font-semibold tabular-nums tracking-tight text-brand-900 dark:text-brand-100">
        {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  to,
  tone = "default",
  icon: Icon,
  sub
}) {
  const toneClass =
    tone === "danger"
      ? "bg-gradient-to-br from-rose-50 to-white text-rose-900 ring-rose-200/80 dark:from-rose-950/40 dark:to-slate-900 dark:text-rose-100 dark:ring-rose-900/50"
      : tone === "brand"
        ? "bg-gradient-to-br from-brand-50 to-sky-50/80 text-brand-950 ring-brand-200/70 dark:from-brand-950/40 dark:to-slate-900 dark:text-brand-100 dark:ring-brand-800/50"
        : "bg-gradient-to-br from-white to-slate-50/90 text-slate-900 ring-slate-200/70 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100 dark:ring-slate-700/70";
  const inner = (
    <div
      className={[
        "secretary-stagger-in relative overflow-hidden rounded-2xl p-4 ring-1 shadow-sm transition-transform duration-300 hover:-translate-y-0.5",
        toneClass
      ].join(" ")}
    >
      {Icon ? (
        <Icon className="pointer-events-none absolute -right-1 -top-1 h-16 w-16 text-brand-500/10 dark:text-brand-300/10" aria-hidden />
      ) : null}
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">{value}</div>
        {sub ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div> : null}
      </div>
    </div>
  );
  if (!to) return inner;
  return (
    <Link to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
      {inner}
    </Link>
  );
}

const QUICK = [
  { to: "/secretary/tasks", label: "Tasks & workflows", desc: "Kanban, approvals, dependencies", icon: IconClipboard, accent: "from-fuchsia-500/15 to-transparent" },
  { to: "/crm", label: "Contacts CRM", desc: "Clients & relationships", icon: IconUsers, accent: "from-indigo-500/15 to-transparent" },
  { to: "/meetings", label: "Meetings", desc: "Agendas & board packs", icon: IconCalendar, accent: "from-amber-500/15 to-transparent" },
  { to: "/documents", label: "Documents", desc: "Registers & filings", icon: IconClipboard, accent: "from-emerald-500/12 to-transparent" },
  { to: "/forms", label: "Forms", desc: "Internal requests", icon: IconPostTx, accent: "from-violet-500/12 to-transparent" },
  { to: "/chat", label: "Chat", desc: "Team conversations", icon: IconUsers, accent: "from-sky-500/15 to-transparent" },
  { to: "/notifications", label: "Notifications", desc: "Alerts & tasks", icon: IconBolt, accent: "from-rose-500/12 to-transparent" },
  { to: "/invoices", label: "Invoices", desc: "Billing workspace", icon: IconReports, accent: "from-teal-500/12 to-transparent" },
  { to: "/help", label: "Help", desc: "Guides & shortcuts", icon: IconSparkles, accent: "from-brand-500/15 to-transparent" }
];

const GOVERNANCE_CHECKLIST = [
  { text: "Confirm next meeting materials are circulated on time.", done: false },
  { text: "Track statutory filing and review dates in Documents.", done: false },
  { text: "Keep board minutes and resolutions aligned with the register.", done: false },
  { text: "Coordinate follow-ups via Chat and Notifications.", done: false }
];

export default function SecretaryDashboard() {
  const { me } = useOutletContext() || {};
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const qSettings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const qAbout = useQuery({ queryKey: ["about-page"], queryFn: getAboutPage });
  const qDocs = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const qMeetings = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const qRooms = useQuery({
    queryKey: ["chat_rooms", { includeArchived: false }],
    queryFn: () => listChatRooms({ includeArchived: false })
  });
  const qNotifs = useQuery({
    queryKey: ["notifications", { unreadOnly: false }],
    queryFn: () => listNotifications({ limit: 24 }),
    refetchInterval: 30_000
  });
  const qForms = useQuery({
    queryKey: ["internal-forms", { mine: true }],
    queryFn: () => listInternalForms({ mine: true })
  });

  const meetings = useMemo(() => (Array.isArray(qMeetings.data) ? qMeetings.data : []), [qMeetings.data]);
  const upcomingMeetings = useMemo(() => {
    /* eslint-disable-next-line react-hooks/purity -- "now" anchor for upcoming window */
    const now = Date.now();
    const rows = meetings
      .filter((m) => m?.status !== "CANCELLED")
      .map((m) => {
        const dateKey = m.date ? String(m.date) : "";
        const timeKey = m.time ? String(m.time) : "00:00";
        const t = new Date(`${dateKey}T${timeKey}`);
        return { ...m, _ts: Number.isNaN(t.getTime()) ? null : t.getTime() };
      })
      .filter((m) => m._ts != null && m._ts >= now - 12 * 60 * 60 * 1000)
      .sort((a, b) => a._ts - b._ts);
    return rows.slice(0, 12);
  }, [meetings]);
  const nextMeeting = upcomingMeetings[0] || null;
  const nextMeetingMins = useMemo(() => (nextMeeting?._ts != null ? minutesUntil(nextMeeting._ts) : null), [nextMeeting]);

  const rooms = useMemo(() => (Array.isArray(qRooms.data) ? qRooms.data : []), [qRooms.data]);
  const unreadChat = useMemo(() => rooms.reduce((s, r) => s + (Number(r.unreadCount) || 0), 0), [rooms]);
  const topRooms = useMemo(() => {
    const lastTs = (r) => (r?.lastMessage?.createdAt ? new Date(r.lastMessage.createdAt).getTime() : 0);
    return [...rooms].sort((a, b) => lastTs(b) - lastTs(a)).slice(0, 4);
  }, [rooms]);

  const docs = useMemo(() => (Array.isArray(qDocs.data) ? qDocs.data : []), [qDocs.data]);
  const docCount = docs.filter((d) => d.status !== "ARCHIVED").length;
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const docsReviewSoon = useMemo(() => {
    return [...docs]
      .filter((d) => d.status !== "ARCHIVED")
      .filter((d) => d.reviewDate && String(d.reviewDate) >= todayKey && String(d.reviewDate) <= addDaysKey(todayKey, 30))
      .sort((a, b) => String(a.reviewDate || "").localeCompare(String(b.reviewDate || "")))
      .slice(0, 4);
  }, [docs, todayKey]);
  const docsExpiringSoon = useMemo(() => {
    return [...docs]
      .filter((d) => d.status !== "ARCHIVED")
      .filter((d) => {
        const du = daysUntilDate(d.expiryDate);
        return du != null && du <= 30 && du >= 0;
      })
      .sort((a, b) => String(a.expiryDate || "").localeCompare(String(b.expiryDate || "")))
      .slice(0, 4);
  }, [docs]);

  const notifsUnread = qNotifs.data?.unreadCount ?? 0;
  const recentNotifs = useMemo(() => {
    const items = qNotifs.data?.items;
    return Array.isArray(items) ? items.slice(0, 5) : [];
  }, [qNotifs.data?.items]);

  const myForms = useMemo(() => (Array.isArray(qForms.data) ? qForms.data : []), [qForms.data]);
  const pendingForms = useMemo(() => myForms.filter((f) => f.status === "PENDING").length, [myForms]);

  const isoWeek = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return (
      1 +
      Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)
    );
  }, []);

  const isLoading =
    qSettings.isLoading ||
    qAbout.isLoading ||
    qDocs.isLoading ||
    qMeetings.isLoading ||
    qRooms.isLoading ||
    qNotifs.isLoading ||
    qForms.isLoading;
  const firstError =
    qSettings.error ||
    qAbout.error ||
    qDocs.error ||
    qMeetings.error ||
    qRooms.error ||
    qNotifs.error ||
    qForms.error;

  function refreshAll() {
    setLastRefreshAt(new Date().toISOString());
    return Promise.all([
      qSettings.refetch(),
      qAbout.refetch(),
      qDocs.refetch(),
      qMeetings.refetch(),
      qRooms.refetch(),
      qNotifs.refetch(),
      qForms.refetch()
    ]);
  }

  if (isLoading) return <Loading label="Loading secretary dashboard..." />;
  if (firstError) return <ErrorBanner error={firstError} />;

  const session = qSettings.data?.session || {};
  const displayName = me?.director?.name || (session.email ? String(session.email).split("@")[0] : "Secretary");
  const about = qAbout.data?.payload;
  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="secretary-stagger-in space-y-8 pb-12">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-brand-50/40 to-sky-50/50 shadow-md dark:border-slate-700/80 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950/35">
        <div className="secretary-shimmer-bar pointer-events-none absolute inset-x-0 top-0 h-1 opacity-80" aria-hidden />
        <div
          className="pointer-events-none absolute -right-16 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-gradient-to-br from-sky-400/20 to-brand-500/10 blur-3xl dark:from-sky-500/10 dark:to-brand-600/10"
          aria-hidden
        />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1fr_min(380px,42%)] lg:items-center lg:p-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-800 shadow-sm dark:border-brand-700/50 dark:bg-slate-800/90 dark:text-brand-200">
                <IconSparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                Governance workspace
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ISO week {isoWeek}</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
              Secretary <span className="bg-gradient-to-r from-brand-700 to-sky-600 bg-clip-text text-transparent dark:from-brand-300 dark:to-sky-400">command center</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Meetings, registers, correspondence, and compliance signals — organized in one professional view. Refresh
              anytime to sync the latest activity.
            </p>
            {lastRefreshAt ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Last refreshed {new Date(lastRefreshAt).toLocaleString()}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" className="ui-btn-outline motion-safe:transition motion-safe:hover:-translate-y-0.5" onClick={() => void refreshAll()}>
                Refresh data
              </button>
              <Link className="ui-btn-outline motion-safe:transition motion-safe:hover:-translate-y-0.5" to="/settings">
                Settings
              </Link>
              <Link
                className="rounded-lg border border-brand-200 bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:border-brand-500 dark:bg-brand-600 dark:hover:bg-brand-500"
                to="/meetings"
              >
                Open meetings
              </Link>
            </div>
          </div>
          <div className="relative flex flex-col items-center justify-center gap-4 lg:min-h-[200px]">
            <SecretaryHeroIllustration className="secretary-hero-art-float w-full max-w-[min(100%,380px)] drop-shadow-lg" />
            <LiveClock />
          </div>
        </div>
      </div>

      {/* Profile strip */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-sky-500 text-lg font-bold text-white shadow-lg shadow-brand-600/25 ring-4 ring-brand-100/80 dark:ring-brand-900/50">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-slate-900 dark:text-slate-50">{displayName}</div>
          <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-brand-700 dark:text-brand-300">Company secretary</span>
            <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
            <span className="truncate text-slate-500 dark:text-slate-400">{session.email || "—"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="ui-btn-outline-xs" to="/notifications">
            Notifications
          </Link>
          <Link className="ui-btn-outline-xs" to="/documents">
            Documents
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div>
        <SectionTitle icon={IconClipboard}>At a glance</SectionTitle>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi
            label="Upcoming"
            value={String(upcomingMeetings.length)}
            sub="scheduled"
            to="/meetings"
            tone={upcomingMeetings.length ? "brand" : "default"}
            icon={IconCalendar}
          />
          <Kpi
            label="Documents"
            value={String(docCount)}
            sub="active"
            to="/documents"
            tone={docCount ? "brand" : "default"}
            icon={IconClipboard}
          />
          <Kpi
            label="Unread chat"
            value={String(unreadChat)}
            sub="messages"
            to="/chat"
            tone={unreadChat ? "brand" : "default"}
            icon={IconUsers}
          />
          <Kpi
            label="Alerts"
            value={String(notifsUnread)}
            sub="notifications"
            to="/notifications"
            tone={notifsUnread ? "danger" : "default"}
            icon={IconBolt}
          />
          <Kpi
            label="My forms"
            value={String(pendingForms)}
            sub="pending"
            to="/forms"
            tone={pendingForms ? "brand" : "default"}
            icon={IconPostTx}
          />
        </div>
      </div>

      {/* Next meeting + compliance + alerts */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          {nextMeeting ? (
            <div className="secretary-next-ring relative overflow-hidden rounded-2xl border border-brand-300/50 bg-gradient-to-br from-brand-50 via-white to-sky-50 p-5 dark:border-brand-800/50 dark:from-brand-950/40 dark:via-slate-900 dark:to-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-800 dark:text-brand-200">
                    <IconClock className="h-4 w-4" aria-hidden />
                    Next meeting
                  </div>
                  <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{nextMeeting.title || "Meeting"}</div>
                  {nextMeeting.date ? (
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{String(nextMeeting.date)}</div>
                  ) : null}
                </div>
                <div className="rounded-xl bg-white/90 px-3 py-2 text-center shadow-sm dark:bg-slate-800/90">
                  <div className="text-2xl font-black tabular-nums text-brand-700 dark:text-brand-200">
                    {nextMeetingMins == null ? "—" : nextMeetingMins <= 0 ? "●" : nextMeetingMins}
                  </div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    {nextMeetingMins == null ? "" : nextMeetingMins <= 0 ? "Live" : "min"}
                  </div>
                </div>
              </div>
              <Link className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-800 hover:underline dark:text-brand-200" to="/meetings">
                View schedule →
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center dark:border-slate-600 dark:bg-slate-900/50">
              <IconCalendar className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">No upcoming meetings on the calendar.</p>
              <Link className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" to="/meetings">
                Plan a meeting
              </Link>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <SectionTitle icon={IconCheckCircle}>Governance checklist</SectionTitle>
            <ul className="mt-3 space-y-2">
              {GOVERNANCE_CHECKLIST.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700 dark:border-slate-700/80 dark:bg-slate-800/50 dark:text-slate-200"
                >
                  <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white p-4 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-slate-900">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Document compliance</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-100 bg-white/90 p-3 dark:border-amber-900/30 dark:bg-slate-900/70">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Review due (30d)</div>
                <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{docsReviewSoon.length}</div>
              </div>
              <div className="rounded-xl border border-rose-100 bg-white/90 p-3 dark:border-rose-900/30 dark:bg-slate-900/70">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Expiry soon</div>
                <div className="text-2xl font-bold text-rose-800 dark:text-rose-200">{docsExpiringSoon.length}</div>
              </div>
            </div>
            {(docsReviewSoon.length > 0 || docsExpiringSoon.length > 0) && (
              <Link className="mt-3 block text-center text-sm font-semibold text-brand-800 hover:underline dark:text-brand-200" to="/documents">
                Review in Documents →
              </Link>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <SectionTitle icon={IconBolt}>Recent alerts</SectionTitle>
            {recentNotifs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">You&apos;re all caught up.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recentNotifs.map((n) => (
                  <li key={n.id ?? n.createdAt}>
                    <Link
                      to="/notifications"
                      className="block rounded-lg border border-transparent px-2 py-1.5 text-sm transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800/80"
                    >
                      <span className={n.readAt ? "text-slate-600 dark:text-slate-300" : "font-medium text-slate-900 dark:text-white"}>
                        {notificationKindLabel(n.type) ? (
                          <span className="mr-1.5 inline-block rounded bg-slate-200/90 px-1 py-0.5 text-[9px] font-semibold uppercase text-slate-700 dark:bg-slate-700/80 dark:text-slate-200">
                            {notificationKindLabel(n.type)}
                          </span>
                        ) : null}
                        {n.title || n.body || "Notification"}
                      </span>
                      {n.createdAt ? (
                        <span className="mt-0.5 block text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <SectionTitle icon={IconUsers}>Chat activity</SectionTitle>
            {topRooms.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No recent rooms.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topRooms.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={r.id ? `/chat/rooms/${r.id}` : "/chat"}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/80"
                    >
                      <span className="truncate font-medium text-slate-800 dark:text-slate-100">{r.name || "Room"}</span>
                      {(Number(r.unreadCount) || 0) > 0 ? (
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          {r.unreadCount}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link className="mt-3 block text-center text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" to="/chat">
              Open chat →
            </Link>
          </div>

          {about?.introParagraphs?.[0] ? (
            <div className="mt-6 rounded-2xl border border-sky-200/70 bg-gradient-to-br from-sky-50/80 to-white p-4 dark:border-sky-900/50 dark:from-sky-950/30 dark:to-slate-900">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                <IconSparkles className="h-4 w-4 text-amber-500" aria-hidden />
                Announcements
              </div>
              <p className="mt-2 line-clamp-4 text-sm text-slate-700 dark:text-slate-200">{about.introParagraphs[0]}</p>
              <Link className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" to="/about">
                Read more
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Timeline */}
      {upcomingMeetings.length > 1 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/75">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon={IconCalendar}>Meeting timeline</SectionTitle>
            <Link to="/meetings" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Full calendar
            </Link>
          </div>
          <div className="relative mt-6 pl-6">
            <div className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-gradient-to-b from-brand-400 via-brand-300 to-transparent dark:from-brand-600 dark:via-brand-700" aria-hidden />
            <ul className="space-y-5">
              {upcomingMeetings.slice(0, 6).map((m, idx) => (
                <li key={m.id ?? `${m.date}-${idx}`} className="relative">
                  <span className="absolute -left-6 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-[10px] font-bold text-white shadow dark:border-slate-900">
                    {idx + 1}
                  </span>
                  <div className="font-semibold text-slate-900 dark:text-white">{m.title || "Meeting"}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {m.date ? String(m.date) : "—"}
                    {m._ts != null ? ` · ${new Date(m._ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Quick access bento */}
      <div>
        <SectionTitle icon={IconSparkles}>Quick access</SectionTitle>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK.map((item) => {
            const { to, label, desc, accent } = item;
            const Icon = item.icon;
            return (
            <li key={to} className="secretary-stagger-in">
              <Link to={to} className={`secretary-quick-card group block h-full bg-gradient-to-br p-4 ${accent}`}>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-sky-600 text-white shadow-md shadow-brand-600/20 transition group-hover:scale-105">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="mt-3 block font-semibold text-slate-900 dark:text-white">{label}</span>
                <span className="mt-1 block text-xs leading-snug text-slate-600 dark:text-slate-400">{desc}</span>
              </Link>
            </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/90 px-4 py-3 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
        Financial analytics and posting use the main{" "}
        <Link className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800 dark:text-brand-300" to="/dashboard">
          Dashboard
        </Link>{" "}
        when your administrator assigns an additional role with that access.
      </div>
    </div>
  );
}
