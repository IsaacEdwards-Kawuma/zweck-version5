import { Link, useOutletContext } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageHero from "../components/PageHero";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { IconBolt, IconCalendar, IconClipboard, IconPostTx, IconReports, IconUsers } from "../components/Icons";
import { getSettings } from "../api/settings";
import { listDocuments } from "../api/documents";
import { listMeetings } from "../api/meetings";
import { listChatRooms } from "../api/chat";
import { listNotifications } from "../api/notifications";

function minutesUntil(ts) {
  if (!Number.isFinite(ts)) return null;
  return Math.floor((ts - Date.now()) / 60000);
}

function Kpi({ label, value, to, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "bg-rose-50 text-rose-900 ring-rose-200/80 dark:bg-rose-950/35 dark:text-rose-200 dark:ring-rose-900/50"
      : tone === "brand"
        ? "bg-brand-50 text-brand-950 ring-brand-200/80 dark:bg-brand-950/35 dark:text-brand-200 dark:ring-brand-900/50"
        : "bg-white/80 text-slate-900 ring-slate-200/70 dark:bg-slate-950/25 dark:text-slate-100 dark:ring-slate-700/70";
  const inner = (
    <div className={["ui-animate-pop rounded-2xl p-4 ring-1 shadow-sm", toneClass].join(" ")}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
  if (!to) return inner;
  return (
    <Link to={to} className="block transition hover:-translate-y-0.5">
      {inner}
    </Link>
  );
}

const QUICK = [
  { to: "/meetings", label: "Meetings", desc: "Schedule and board packs", icon: IconCalendar },
  { to: "/documents", label: "Documents", desc: "Registers and filings", icon: IconClipboard },
  { to: "/forms", label: "Forms", desc: "Internal requests", icon: IconPostTx },
  { to: "/chat", label: "Chat", desc: "Team messages", icon: IconUsers },
  { to: "/notifications", label: "Notifications", desc: "Alerts and tasks", icon: IconBolt },
  { to: "/invoices", label: "Invoices", desc: "Billing (if enabled)", icon: IconReports }
];

export default function SecretaryDashboard() {
  const { me } = useOutletContext() || {};
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const qSettings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const qDocs = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const qMeetings = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const qRooms = useQuery({
    queryKey: ["chat_rooms", { includeArchived: false }],
    queryFn: () => listChatRooms({ includeArchived: false })
  });
  const qNotifs = useQuery({
    queryKey: ["notifications", { unreadOnly: false }],
    queryFn: () => listNotifications({ limit: 20 }),
    refetchInterval: 60_000
  });

  const meetings = useMemo(() => (Array.isArray(qMeetings.data) ? qMeetings.data : []), [qMeetings.data]);
  const upcomingMeetings = useMemo(() => {
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
    return rows.slice(0, 8);
  }, [meetings]);
  const nextMeeting = upcomingMeetings[0] || null;
  const nextMeetingMins = useMemo(() => (nextMeeting?._ts != null ? minutesUntil(nextMeeting._ts) : null), [nextMeeting]);

  const rooms = useMemo(() => (Array.isArray(qRooms.data) ? qRooms.data : []), [qRooms.data]);
  const unreadChat = useMemo(() => rooms.reduce((s, r) => s + (Number(r.unreadCount) || 0), 0), [rooms]);

  const docs = useMemo(() => (Array.isArray(qDocs.data) ? qDocs.data : []), [qDocs.data]);
  const docCount = docs.filter((d) => d.status !== "ARCHIVED").length;

  const notifsUnread = qNotifs.data?.unreadCount ?? 0;

  const isLoading =
    qSettings.isLoading || qDocs.isLoading || qMeetings.isLoading || qRooms.isLoading || qNotifs.isLoading;
  const firstError = qSettings.error || qDocs.error || qMeetings.error || qRooms.error || qNotifs.error;

  function refreshAll() {
    setLastRefreshAt(new Date().toISOString());
    return Promise.all([
      qSettings.refetch(),
      qDocs.refetch(),
      qMeetings.refetch(),
      qRooms.refetch(),
      qNotifs.refetch()
    ]);
  }

  if (isLoading) return <Loading label="Loading secretary dashboard..." />;
  if (firstError) return <ErrorBanner error={firstError} />;

  const session = qSettings.data?.session || {};
  const displayName = me?.director?.name || (session.email ? String(session.email).split("@")[0] : "Secretary");

  return (
    <div className="space-y-8 pb-10">
      <PageHero
        icon={IconClipboard}
        title="Secretary dashboard"
        subtitle={
          <>
            Meetings, documents, and coordination — tailored for the company secretary role.
            {lastRefreshAt ? (
              <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                Last refreshed: {new Date(lastRefreshAt).toLocaleString()}
              </span>
            ) : null}
          </>
        }
      >
        <button type="button" className="ui-btn-outline" onClick={() => void refreshAll()}>
          Refresh
        </button>
        <Link className="ui-btn-outline" to="/settings">
          Settings
        </Link>
      </PageHero>

      <div className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
        <div className="text-sm font-semibold ui-page-heading">Signed in</div>
        <div className="mt-2 text-sm ui-body-text">
          <span className="text-slate-500 dark:text-slate-400">Name:</span>{" "}
          <span className="font-medium text-slate-900 dark:text-slate-100">{displayName}</span>
          <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
          <span className="text-slate-500 dark:text-slate-400">Role:</span>{" "}
          <span className="font-medium text-slate-900 dark:text-slate-100">Secretary</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Upcoming meetings"
          value={String(upcomingMeetings.length)}
          to="/meetings"
          tone={upcomingMeetings.length ? "brand" : "default"}
        />
        <Kpi label="Active documents" value={String(docCount)} to="/documents" tone={docCount ? "brand" : "default"} />
        <Kpi
          label="Unread chat"
          value={String(unreadChat)}
          to="/chat"
          tone={unreadChat ? "brand" : "default"}
        />
        <Kpi
          label="Notifications"
          value={String(notifsUnread)}
          to="/notifications"
          tone={notifsUnread ? "danger" : "default"}
        />
      </div>

      {nextMeeting ? (
        <div className="ui-animate-pop rounded-2xl border border-brand-200/60 bg-brand-50/40 p-4 dark:border-brand-900/40 dark:bg-brand-950/25">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-brand-950 dark:text-brand-100">Next meeting</div>
            <div className="text-xs font-medium text-brand-800 dark:text-brand-200">
              {nextMeetingMins == null ? "—" : nextMeetingMins <= 0 ? "Starting now" : `in ${nextMeetingMins} min`}
            </div>
          </div>
          <div className="mt-1 text-sm text-brand-900/90 dark:text-brand-100/90">
            {nextMeeting.title || "Meeting"}{" "}
            {nextMeeting.date ? <span className="text-brand-700/80 dark:text-brand-300/90">· {String(nextMeeting.date)}</span> : null}
          </div>
          <Link className="mt-3 inline-block text-sm font-medium text-brand-800 underline hover:text-brand-900 dark:text-brand-200" to="/meetings">
            Open meetings →
          </Link>
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick access</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK.map(({ to, label, desc, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex gap-3 rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-brand-500/40 dark:hover:bg-brand-950/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-slate-900 dark:text-slate-100">{label}</span>
                  <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{desc}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {upcomingMeetings.length > 1 ? (
        <div className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold ui-page-heading">Coming up</div>
            <Link to="/meetings" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              All meetings
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-200/80 dark:divide-slate-700">
            {upcomingMeetings.slice(0, 5).map((m) => (
              <li key={m.id ?? `${m.date}-${m.title}`} className="py-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-slate-100">{m.title || "Meeting"}</span>
                {m.date ? <span className="ml-2 text-slate-500 dark:text-slate-400">{String(m.date)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Financial posting and reports use the main{" "}
        <Link className="font-medium text-brand-700 underline dark:text-brand-300" to="/dashboard">
          Dashboard
        </Link>{" "}
        if your administrator grants access via other roles.
      </p>
    </div>
  );
}
