import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageHero from "../components/PageHero";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { IconDashboard } from "../components/Icons";
import { listDocuments } from "../api/documents";
import { downloadMeetingsCalendarIcs, listMeetings } from "../api/meetings";
import { createDmRoomByEmail, listChatRooms, listChatUsers } from "../api/chat";
import { listInternalForms } from "../api/internalForms";
import { getSettings } from "../api/settings";
import { getAboutPage } from "../api/aboutPage";
import { clearAllNotifications, deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { openStoredPdfUrl } from "../lib/openPdf";

const DOC_FAVS_KEY = "zweck_user_doc_favs_v1";
const DASH_LAYOUT_KEY = "zweck_user_dashboard_layout_v1";
const QUICK_LINKS_KEY = "zweck_user_dashboard_quicklinks_v1";
const FORMS_DRAFT_KEY = "zweck_forms_draft_v1";

function safeParseJson(raw, fallback) {
  try {
    const v = raw ? JSON.parse(raw) : fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString();
}

function fmtDate(iso) {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleDateString();
}

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

function ModalShell({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold ui-page-heading">{title}</div>
          <button type="button" className="ui-btn-outline-xs" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const DEFAULT_SECTIONS = [
  "kpis",
  "profile",
  "announcements",
  "quickLinks",
  "notifications",
  "documents",
  "meetings",
  "chat",
  "forms"
];

const QUICK_LINK_OPTIONS = [
  { id: "forms", label: "Submit form", to: "/forms#forms-new" },
  { id: "chat", label: "Open chat", to: "/chat" },
  { id: "meetings", label: "View meetings", to: "/meetings" },
  { id: "documents", label: "Find document", to: "/documents" },
  { id: "help", label: "Help & guides", to: "/help" },
  { id: "settings", label: "Settings", to: "/settings" }
];

export default function UserDashboard() {
  const { me } = useOutletContext() || {};
  const nav = useNavigate();
  const qc = useQueryClient();
  const name = me?.director?.name || (me?.email ? String(me.email).split("@")[0] : "User");

  const [favVersion, setFavVersion] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmEmail, setDmEmail] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const qSettings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const qAbout = useQuery({ queryKey: ["about-page"], queryFn: getAboutPage });
  const qDocs = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const qMeetings = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const qRooms = useQuery({
    queryKey: ["chat_rooms", { includeArchived: false }],
    queryFn: () => listChatRooms({ includeArchived: false })
  });
  const qChatUsers = useQuery({ queryKey: ["chat_users"], queryFn: listChatUsers });
  const qMyForms = useQuery({
    queryKey: ["internal-forms", { mine: true }],
    queryFn: () => listInternalForms({ mine: true })
  });
  const qNotifs = useQuery({
    queryKey: ["notifications", { unreadOnly: false }],
    queryFn: () => listNotifications({ limit: 20 }),
    refetchInterval: 60_000
  });

  const mNotifRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });
  const mNotifReadAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });
  const mNotifClearAll = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });
  const mNotifDelete = useMutation({
    mutationFn: deleteNotification,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["notifications"] })
  });

  const mCreateDm = useMutation({
    mutationFn: ({ otherEmail }) => createDmRoomByEmail({ otherEmail }),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      const roomId = data?.room?.id;
      setDmOpen(false);
      setDmEmail("");
      if (roomId) nav(`/chat/rooms/${roomId}`);
      else nav("/chat");
    }
  });

  const favDocIds = useMemo(() => {
    const raw = localStorage.getItem(DOC_FAVS_KEY);
    const arr = safeParseJson(raw, []);
    return new Set((Array.isArray(arr) ? arr : []).map((x) => String(x)));
  }, [favVersion]);

  const docs = useMemo(() => (Array.isArray(qDocs.data) ? qDocs.data : []), [qDocs.data]);
  const favDocs = useMemo(() => docs.filter((d) => favDocIds.has(String(d.id))), [docs, favDocIds]);
  const recentDocs = useMemo(() => {
    const sorted = [...docs].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return sorted.slice(0, 6);
  }, [docs]);
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
      .filter((d) => d.expiryDate && String(d.expiryDate) >= todayKey && String(d.expiryDate) <= addDaysKey(todayKey, 30))
      .sort((a, b) => String(a.expiryDate || "").localeCompare(String(b.expiryDate || "")))
      .slice(0, 4);
  }, [docs, todayKey]);

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
    return rows.slice(0, 6);
  }, [meetings]);
  const nextMeeting = upcomingMeetings[0] || null;
  const nextMeetingMins = useMemo(() => (nextMeeting?._ts != null ? minutesUntil(nextMeeting._ts) : null), [nextMeeting]);

  const rooms = useMemo(() => (Array.isArray(qRooms.data) ? qRooms.data : []), [qRooms.data]);
  const unreadRooms = useMemo(() => rooms.filter((r) => (Number(r.unreadCount) || 0) > 0), [rooms]);
  const unreadCount = useMemo(() => rooms.reduce((s, r) => s + (Number(r.unreadCount) || 0), 0), [rooms]);
  const topRooms = useMemo(() => {
    const lastTs = (r) => (r?.lastMessage?.createdAt ? new Date(r.lastMessage.createdAt).getTime() : 0);
    return [...rooms].sort((a, b) => lastTs(b) - lastTs(a)).slice(0, 6);
  }, [rooms]);

  const myForms = useMemo(() => (Array.isArray(qMyForms.data) ? qMyForms.data : []), [qMyForms.data]);
  const pendingForms = useMemo(() => myForms.filter((f) => f.status === "PENDING").slice(0, 6), [myForms]);
  const formStats = useMemo(() => {
    const s = { total: myForms.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const f of myForms) {
      if (f.status === "PENDING") s.pending += 1;
      else if (f.status === "APPROVED") s.approved += 1;
      else if (f.status === "REJECTED") s.rejected += 1;
      else if (f.status === "CANCELLED") s.cancelled += 1;
    }
    return s;
  }, [myForms]);
  const hasFormsDraft = useMemo(() => {
    const draft = safeParseJson(localStorage.getItem(FORMS_DRAFT_KEY), null);
    return Boolean(draft && typeof draft === "object" && String(draft.title || "").trim());
  }, [layoutVersion]);

  const notifsUnread = qNotifs.data?.unreadCount ?? 0;
  const notifs = qNotifs.data?.items ?? [];

  const isLoading =
    qSettings.isLoading ||
    qAbout.isLoading ||
    qDocs.isLoading ||
    qMeetings.isLoading ||
    qRooms.isLoading ||
    qMyForms.isLoading ||
    qNotifs.isLoading;
  const firstError =
    qSettings.error || qAbout.error || qDocs.error || qMeetings.error || qRooms.error || qMyForms.error || qNotifs.error;

  function toggleDocFav(id) {
    const key = String(id);
    const cur = safeParseJson(localStorage.getItem(DOC_FAVS_KEY), []);
    const arr = (Array.isArray(cur) ? cur : []).map((x) => String(x));
    const next = arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key];
    localStorage.setItem(DOC_FAVS_KEY, JSON.stringify(next));
    setFavVersion((v) => v + 1);
  }

  function refreshAll() {
    setLastRefreshAt(new Date().toISOString());
    return Promise.all([qSettings.refetch(), qAbout.refetch(), qDocs.refetch(), qMeetings.refetch(), qRooms.refetch(), qMyForms.refetch(), qNotifs.refetch()]);
  }

  const sectionPref = useMemo(() => {
    const raw = localStorage.getItem(DASH_LAYOUT_KEY);
    const p = safeParseJson(raw, null);
    const order = Array.isArray(p?.order) ? p.order.filter((id) => typeof id === "string") : DEFAULT_SECTIONS;
    const hidden = p?.hidden && typeof p.hidden === "object" ? p.hidden : {};
    const normalizedOrder = DEFAULT_SECTIONS.filter((id) => order.includes(id)).concat(order.filter((id) => DEFAULT_SECTIONS.includes(id) && !DEFAULT_SECTIONS.includes(id)));
    return { order: normalizedOrder.length ? normalizedOrder : DEFAULT_SECTIONS, hidden };
  }, [layoutVersion]);

  const quickLinks = useMemo(() => {
    const raw = localStorage.getItem(QUICK_LINKS_KEY);
    const arr = safeParseJson(raw, null);
    const ids = Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : ["forms", "chat", "meetings", "documents"];
    const dedup = [...new Set(ids)];
    return dedup.filter((id) => QUICK_LINK_OPTIONS.some((o) => o.id === id));
  }, [layoutVersion]);

  function saveLayout(next) {
    localStorage.setItem(DASH_LAYOUT_KEY, JSON.stringify(next));
    setLayoutVersion((v) => v + 1);
  }

  function saveQuickLinks(ids) {
    localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(ids));
    setLayoutVersion((v) => v + 1);
  }

  function addDaysKey(base, days) {
    const t = new Date(`${base}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  }

  function openDocUrl(url) {
    if (!url) return;
    try {
      openStoredPdfUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  }

  if (isLoading) return <Loading label="Loading your dashboard..." />;
  if (firstError) return <ErrorBanner error={firstError} />;

  const session = qSettings.data?.session || {};
  const about = qAbout.data?.payload;

  const dmUsers = Array.isArray(qChatUsers.data) ? qChatUsers.data : [];
  const filteredDmUsers = dmEmail.trim()
    ? dmUsers.filter((u) => String(u.email || "").toLowerCase().includes(dmEmail.trim().toLowerCase())).slice(0, 6)
    : dmUsers.slice(0, 6);

  const renderSection = (id) => {
    if (sectionPref.hidden?.[id]) return null;

    if (id === "kpis") {
      return (
        <div key="kpis" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Unread messages" value={String(unreadCount)} to="/chat" tone={unreadCount ? "brand" : "default"} />
          <Kpi label="Pending forms" value={String(formStats.pending)} to="/forms" tone={formStats.pending ? "brand" : "default"} />
          <Kpi
            label="Next meeting"
            value={nextMeetingMins == null ? "—" : nextMeetingMins <= 0 ? "Now" : `${nextMeetingMins}m`}
            to="/meetings"
            tone={nextMeetingMins != null && nextMeetingMins <= 60 ? "brand" : "default"}
          />
          <Kpi label="Unread notifications" value={String(notifsUnread)} to="/notifications" tone={notifsUnread ? "danger" : "default"} />
        </div>
      );
    }

    if (id === "profile") {
      return (
        <div key="profile" className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">My profile</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Updated {fmtDateTime(lastRefreshAt)}</div>
          </div>
          <div className="mt-2 text-sm ui-body-text">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Email:</span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">{session.email || me?.email || "—"}</span>
            </div>
            <div className="mt-1">
              <span className="text-slate-500 dark:text-slate-400">Role:</span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">{session.role || me?.role || "—"}</span>
            </div>
            <div className="mt-1">
              <span className="text-slate-500 dark:text-slate-400">Last login:</span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">{session.lastLoginAt ? fmtDateTime(session.lastLoginAt) : "—"}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="ui-btn-outline-xs" to="/settings#settings-account">
              Account
            </Link>
            <Link className="ui-btn-outline-xs" to="/notifications">
              Notifications
            </Link>
            {session.directorId != null ? (
              <Link className="ui-btn-outline-xs" to={`/directors/${session.directorId}`}>
                My director profile
              </Link>
            ) : null}
          </div>
        </div>
      );
    }

    if (id === "announcements") {
      return (
        <div key="announcements" className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="text-sm font-semibold ui-page-heading">Announcements</div>
          <div className="mt-2 space-y-2 text-sm ui-body-text">
            {about?.introParagraphs?.length ? (
              <>
                <div className="line-clamp-4">{about.introParagraphs[0]}</div>
                <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/about">
                  Read more
                </Link>
              </>
            ) : (
              <div className="ui-page-muted">No announcements yet.</div>
            )}
          </div>
        </div>
      );
    }

    if (id === "quickLinks") {
      return (
        <div key="quickLinks" className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">Quick actions</div>
            <button type="button" className="ui-btn-outline-xs" onClick={() => setCustomizeOpen(true)}>
              Customize
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {quickLinks.map((id) => {
              const opt = QUICK_LINK_OPTIONS.find((o) => o.id === id);
              if (!opt) return null;
              return (
                <Link key={id} className="ui-btn-outline-xs text-center" to={opt.to}>
                  {opt.label}
                </Link>
              );
            })}
            {hasFormsDraft ? (
              <Link className="ui-btn-outline-xs text-center" to="/forms#forms-new">
                Resume draft
              </Link>
            ) : null}
            <button type="button" className="ui-btn-outline-xs" onClick={() => setDmOpen(true)}>
              Start DM
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="ui-btn-outline-xs" onClick={() => refreshAll()}>
              Refresh
            </button>
            <button type="button" className="ui-btn-outline-xs" onClick={() => downloadMeetingsCalendarIcs()}>
              Download calendar (.ics)
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {lastRefreshAt ? `Last refreshed: ${fmtDateTime(lastRefreshAt)}` : "Use Refresh to update widgets."}
          </div>
        </div>
      );
    }

    if (id === "notifications") {
      return (
        <div key="notifications" className="ui-animate-pop ui-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">Notifications</div>
            <div className="flex items-center gap-2">
              {notifsUnread > 0 ? (
                <button type="button" className="ui-btn-outline-xs" onClick={() => mNotifReadAll.mutate()}>
                  Mark all read
                </button>
              ) : null}
              {notifs.length ? (
                <button
                  type="button"
                  className="ui-btn-outline-xs"
                  onClick={() => {
                    if (!window.confirm("Clear all notifications?")) return;
                    mNotifClearAll.mutate();
                  }}
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-sm ui-page-muted">
            {notifsUnread ? `${notifsUnread} unread` : "No unread notifications."}
          </div>
          <ul className="mt-3 space-y-2">
            {notifs.slice(0, 6).map((n) => (
              <li key={`notif-${n.id}`} className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (!n.readAt) mNotifRead.mutate(n.id);
                      if (n.link) nav(n.link);
                    }}
                  >
                    <div className={["truncate text-sm", n.readAt ? "text-slate-700 dark:text-slate-300" : "font-semibold text-slate-900 dark:text-slate-100"].join(" ")}>
                      {n.title}
                    </div>
                    {n.body ? <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.body}</div> : null}
                    <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDateTime(n.createdAt)}</div>
                  </button>
                  <button type="button" className="ui-btn-outline-xs" onClick={() => mNotifDelete.mutate(n.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {!notifs.length ? <li className="text-sm ui-page-muted">No notifications yet.</li> : null}
          </ul>
        </div>
      );
    }

    if (id === "documents") {
      return (
        <div key="documents" className="ui-animate-pop ui-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">Documents</div>
            <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/documents">
              View all
            </Link>
          </div>
          {docsReviewSoon.length || docsExpiringSoon.length ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Review due (30d)</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {docsReviewSoon.map((d) => (
                    <li key={`rev-${d.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{d.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{d.reviewDate}</span>
                    </li>
                  ))}
                  {!docsReviewSoon.length ? <li className="text-xs ui-page-muted">None</li> : null}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expiring (30d)</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {docsExpiringSoon.map((d) => (
                    <li key={`exp-${d.id}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{d.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{d.expiryDate}</span>
                    </li>
                  ))}
                  {!docsExpiringSoon.length ? <li className="text-xs ui-page-muted">None</li> : null}
                </ul>
              </div>
            </div>
          ) : null}

          {favDocs.length ? (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pinned</div>
              <ul className="mt-2 space-y-2">
                {favDocs.slice(0, 4).map((d) => (
                  <li key={`fav-doc-${d.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{d.title}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {d.category || "—"} · updated {fmtDate(d.updatedAt || d.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.url ? (
                        <button type="button" className="ui-btn-outline-xs" onClick={() => openDocUrl(d.url)}>
                          Open
                        </button>
                      ) : null}
                      <button type="button" className="ui-btn-outline-xs" onClick={() => toggleDocFav(d.id)}>
                        Unpin
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent</div>
            <ul className="mt-2 space-y-2">
              {recentDocs.map((d) => (
                <li key={`doc-${d.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{d.title}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {d.category || "—"} · updated {fmtDate(d.updatedAt || d.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.url ? (
                      <button type="button" className="ui-btn-outline-xs" onClick={() => openDocUrl(d.url)}>
                        Open
                      </button>
                    ) : null}
                    <button type="button" className="ui-btn-outline-xs" onClick={() => toggleDocFav(d.id)}>
                      {favDocIds.has(String(d.id)) ? "Unpin" : "Pin"}
                    </button>
                  </div>
                </li>
              ))}
              {!recentDocs.length ? <li className="text-sm ui-page-muted">No documents yet.</li> : null}
            </ul>
          </div>
        </div>
      );
    }

    if (id === "meetings") {
      return (
        <div key="meetings" className="ui-animate-pop ui-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">Meetings</div>
            <div className="flex items-center gap-2">
              <button type="button" className="ui-btn-outline-xs" onClick={() => downloadMeetingsCalendarIcs()}>
                Calendar (.ics)
              </button>
              <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/meetings">
                View all
              </Link>
            </div>
          </div>
          {nextMeeting ? (
            <div className="mt-2 rounded-xl border border-brand-200/60 bg-brand-50/40 p-3 text-sm dark:border-brand-700/40 dark:bg-brand-950/30">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{nextMeeting.title || "Next meeting"}</div>
              <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                {nextMeeting.date ? String(nextMeeting.date) : "—"} {nextMeeting.time ? String(nextMeeting.time) : ""} · {nextMeeting.location || "—"}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Starts {nextMeetingMins == null ? "—" : nextMeetingMins <= 0 ? "now" : `in ${nextMeetingMins} minutes`}
              </div>
            </div>
          ) : null}
          <ul className="mt-3 space-y-2">
            {upcomingMeetings.map((m) => (
              <li key={`mtg-${m.id}`} className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{m.title || "Meeting"}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {m.date ? String(m.date) : "—"} {m.time ? String(m.time) : ""} · {m.location || "—"}
                    </div>
                  </div>
                  <Link className="ui-btn-outline-xs" to="/meetings">
                    Open
                  </Link>
                </div>
              </li>
            ))}
            {!upcomingMeetings.length ? <li className="text-sm ui-page-muted">No upcoming meetings.</li> : null}
          </ul>
        </div>
      );
    }

    if (id === "chat") {
      return (
        <div key="chat" className="ui-animate-pop ui-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">Chat</div>
            <div className="flex items-center gap-2">
              <button type="button" className="ui-btn-outline-xs" onClick={() => setDmOpen(true)}>
                Start DM
              </button>
              <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/chat">
                Open chat
              </Link>
            </div>
          </div>
          <div className="mt-2 text-sm ui-page-muted">
            {unreadCount ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "No unread messages."}
          </div>
          {(unreadRooms.length ? unreadRooms : topRooms).slice(0, 6).map((r) => (
            <div key={`room-${r.id}`} className="mt-2 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{r.title || r.roomKey || `Room #${r.id}`}</div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {r.lastMessage?.createdAt ? `Last: ${fmtDateTime(r.lastMessage.createdAt)}` : "No messages yet"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {Number(r.unreadCount) ? (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900 ring-1 ring-brand-200/80 dark:bg-brand-950/60 dark:text-brand-200 dark:ring-brand-700/60">
                      {Number(r.unreadCount)}
                    </span>
                  ) : null}
                  <Link className="ui-btn-outline-xs" to={`/chat/rooms/${r.id}`}>
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {!topRooms.length ? <div className="mt-3 text-sm ui-page-muted">No rooms yet.</div> : null}
        </div>
      );
    }

    if (id === "forms") {
      return (
        <div key="forms" className="ui-animate-pop ui-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">My forms</div>
            <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/forms">
              View all
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending</div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{formStats.pending}</div>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-700/70 dark:bg-slate-950/30">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{formStats.total}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="ui-btn-outline-xs" to="/forms#forms-new">
              Submit a new form
            </Link>
            {hasFormsDraft ? (
              <Link className="ui-btn-outline-xs" to="/forms#forms-new">
                Resume draft
              </Link>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2">
            {pendingForms.map((f) => (
              <li key={`form-${f.id}`} className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{f.title || `Form #${f.id}`}</div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {f.kind || "—"} · submitted {fmtDateTime(f.createdAt)}
                    </div>
                  </div>
                  <Link className="ui-btn-outline-xs" to="/forms">
                    Open
                  </Link>
                </div>
              </li>
            ))}
            {!pendingForms.length ? <li className="text-sm ui-page-muted">No pending forms.</li> : null}
          </ul>
        </div>
      );
    }

    return null;
  };

  function moveSection(id, dir) {
    const order = [...sectionPref.order];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    saveLayout({ ...sectionPref, order: next });
  }

  function toggleHidden(id) {
    const hidden = { ...(sectionPref.hidden || {}) };
    hidden[id] = !hidden[id];
    saveLayout({ ...sectionPref, hidden });
  }

  return (
    <div className="space-y-6">
      <PageHero icon={IconDashboard} title={`Welcome, ${name}`} subtitle="Your workspace, personalized and always up to date." />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm ui-page-muted">
          {lastRefreshAt ? `Last refreshed: ${fmtDateTime(lastRefreshAt)}` : "Tip: Customize sections and quick actions."}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ui-btn-outline" onClick={() => refreshAll()}>
            Refresh
          </button>
          <button type="button" className="ui-btn-outline" onClick={() => setCustomizeOpen(true)}>
            Customize
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {sectionPref.order.map((id) => renderSection(id))}
      </div>

      <ModalShell open={customizeOpen} title="Customize dashboard" onClose={() => setCustomizeOpen(false)}>
        <div className="text-sm ui-page-muted">Reorder sections, hide what you don’t need, and choose your quick actions.</div>

        <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-700/70 dark:bg-slate-950/25">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick actions</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUICK_LINK_OPTIONS.map((o) => {
              const checked = quickLinks.includes(o.id);
              return (
                <label key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-sm dark:border-slate-700/70 dark:bg-slate-900/40">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...quickLinks, o.id] : quickLinks.filter((id) => id !== o.id);
                      saveQuickLinks(next);
                    }}
                  />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-700/70 dark:bg-slate-950/25">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sections</div>
          <ul className="mt-2 space-y-2">
            {sectionPref.order.map((id, idx) => (
              <li key={`sec-${id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-sm dark:border-slate-700/70 dark:bg-slate-900/40">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" className="ui-btn-outline-xs" disabled={idx === 0} onClick={() => moveSection(id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="ui-btn-outline-xs" disabled={idx === sectionPref.order.length - 1} onClick={() => moveSection(id, +1)}>
                    ↓
                  </button>
                  <span className="truncate font-medium">{id}</span>
                </div>
                <button type="button" className="ui-btn-outline-xs" onClick={() => toggleHidden(id)}>
                  {sectionPref.hidden?.[id] ? "Show" : "Hide"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </ModalShell>

      <ModalShell open={dmOpen} title="Start a direct message" onClose={() => setDmOpen(false)}>
        <div className="text-sm ui-page-muted">Type an email to start a DM (or pick from suggestions).</div>
        <input
          className="ui-input mt-3 w-full"
          placeholder="name@company.com"
          value={dmEmail}
          onChange={(e) => setDmEmail(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={!dmEmail.trim() || mCreateDm.isPending}
            onClick={() => mCreateDm.mutate({ otherEmail: dmEmail.trim() })}
          >
            {mCreateDm.isPending ? "Starting…" : "Start DM"}
          </button>
          <Link className="ui-btn-outline" to="/chat" onClick={() => setDmOpen(false)}>
            Open chat
          </Link>
        </div>
        {filteredDmUsers.length ? (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Suggestions</div>
            <ul className="mt-2 space-y-2">
              {filteredDmUsers.map((u) => (
                <li key={`u-${u.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-sm dark:border-slate-700/70 dark:bg-slate-900/40">
                  <span className="truncate">{u.email}</span>
                  <button type="button" className="ui-btn-outline-xs" onClick={() => setDmEmail(u.email)}>
                    Use
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ModalShell>
    </div>
  );
}

