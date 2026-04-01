import { Link, useOutletContext } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageHero from "../components/PageHero";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { IconDashboard } from "../components/Icons";
import { listDocuments } from "../api/documents";
import { listMeetings } from "../api/meetings";
import { listChatRooms } from "../api/chat";
import { listInternalForms } from "../api/internalForms";
import { getSettings } from "../api/settings";
import { getAboutPage } from "../api/aboutPage";

const DOC_FAVS_KEY = "zweck_user_doc_favs_v1";

function safeParseJsonArray(raw) {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
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

function SurfaceCard({ title, desc, to, metaRight = null, icon = null }) {
  return (
    <Link
      to={to}
      className="group ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-900/70 dark:hover:border-brand-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? <span className="text-slate-500 dark:text-slate-400">{icon}</span> : null}
            <div className="truncate text-sm font-semibold ui-page-heading">{title}</div>
          </div>
          <div className="mt-1 text-sm ui-page-muted">{desc}</div>
        </div>
        {metaRight ? <div className="shrink-0">{metaRight}</div> : null}
      </div>
      <div className="mt-3 text-xs font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
        Open →
      </div>
    </Link>
  );
}

export default function UserDashboard() {
  const { me } = useOutletContext() || {};
  const name = me?.director?.name || (me?.email ? String(me.email).split("@")[0] : "User");
  const [favVersion, setFavVersion] = useState(0);

  const qSettings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const qAbout = useQuery({ queryKey: ["about-page"], queryFn: getAboutPage });
  const qDocs = useQuery({ queryKey: ["documents"], queryFn: listDocuments });
  const qMeetings = useQuery({ queryKey: ["meetings"], queryFn: listMeetings });
  const qRooms = useQuery({ queryKey: ["chat_rooms", { includeArchived: false }], queryFn: () => listChatRooms({ includeArchived: false }) });
  const qMyForms = useQuery({ queryKey: ["internal-forms", { mine: true }], queryFn: () => listInternalForms({ mine: true }) });

  const favDocIds = useMemo(() => {
    const raw = localStorage.getItem(DOC_FAVS_KEY);
    return new Set(safeParseJsonArray(raw).map((x) => String(x)));
  }, [favVersion]);

  const docs = useMemo(() => (Array.isArray(qDocs.data) ? qDocs.data : []), [qDocs.data]);
  const favDocs = useMemo(() => docs.filter((d) => favDocIds.has(String(d.id))), [docs, favDocIds]);
  const recentDocs = useMemo(() => {
    const sorted = [...docs].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
    return sorted.slice(0, 6);
  }, [docs]);

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

  const rooms = useMemo(() => (Array.isArray(qRooms.data) ? qRooms.data : []), [qRooms.data]);
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

  const isLoading = qSettings.isLoading || qAbout.isLoading || qDocs.isLoading || qMeetings.isLoading || qRooms.isLoading || qMyForms.isLoading;
  const firstError = qSettings.error || qAbout.error || qDocs.error || qMeetings.error || qRooms.error || qMyForms.error;

  function toggleDocFav(id) {
    const key = String(id);
    const cur = safeParseJsonArray(localStorage.getItem(DOC_FAVS_KEY)).map((x) => String(x));
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    localStorage.setItem(DOC_FAVS_KEY, JSON.stringify(next));
    setFavVersion((v) => v + 1);
  }

  if (isLoading) return <Loading label="Loading your dashboard..." />;
  if (firstError) return <ErrorBanner error={firstError} />;

  const session = qSettings.data?.session || {};
  const about = qAbout.data?.payload;

  return (
    <div className="space-y-6">
      <PageHero
        icon={IconDashboard}
        title={`Welcome, ${name}`}
        subtitle="Your workspace: profile, announcements, documents, meetings, chat, and forms."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="text-sm font-semibold ui-page-heading">My profile</div>
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
            <Link className="ui-btn-outline-xs" to="/settings#settings-notifications">
              Notifications
            </Link>
            {session.directorId != null ? (
              <Link className="ui-btn-outline-xs" to={`/directors/${session.directorId}`}>
                My director profile
              </Link>
            ) : null}
          </div>
        </div>

        <div className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="text-sm font-semibold ui-page-heading">Announcements</div>
          <div className="mt-2 space-y-2 text-sm ui-body-text">
            {about?.introParagraphs?.length ? (
              <>
                <div className="line-clamp-3">{about.introParagraphs[0]}</div>
                <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/about">
                  Read more
                </Link>
              </>
            ) : (
              <div className="ui-page-muted">No announcements yet.</div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="ui-btn-outline-xs" to="/help">
              Help & guides
            </Link>
            <Link className="ui-btn-outline-xs" to="/documents">
              Browse documents
            </Link>
          </div>
        </div>

        <div className="ui-animate-pop rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70">
          <div className="text-sm font-semibold ui-page-heading">Quick actions</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link className="ui-btn-outline-xs text-center" to="/forms#forms-new">
              Submit form
            </Link>
            <Link className="ui-btn-outline-xs text-center" to="/chat">
              Open chat
            </Link>
            <Link className="ui-btn-outline-xs text-center" to="/meetings">
              View meetings
            </Link>
            <Link className="ui-btn-outline-xs text-center" to="/documents">
              Find document
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ui-animate-pop ui-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold ui-page-heading">Documents</div>
            <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/documents">
              View all
            </Link>
          </div>

          {favDocs.length ? (
            <div className="mt-3">
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
                    <button type="button" className="ui-btn-outline-xs" onClick={() => toggleDocFav(d.id)}>
                      Unpin
                    </button>
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
                    <button type="button" className="ui-btn-outline-xs" onClick={() => toggleDocFav(d.id)}>
                      {favDocIds.has(String(d.id)) ? "Unpin" : "Pin"}
                    </button>
                    <Link className="ui-btn-outline-xs" to="/documents">
                      Open
                    </Link>
                  </div>
                </li>
              ))}
              {!recentDocs.length ? <li className="text-sm ui-page-muted">No documents yet.</li> : null}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-animate-pop ui-surface rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold ui-page-heading">Meetings</div>
              <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/meetings">
                View all
              </Link>
            </div>
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

          <div className="ui-animate-pop ui-surface rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold ui-page-heading">Chat</div>
              <Link className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" to="/chat">
                Open chat
              </Link>
            </div>
            <div className="mt-2 text-sm ui-page-muted">
              {unreadCount ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "No unread messages."}
            </div>
            <ul className="mt-3 space-y-2">
              {topRooms.map((r) => (
                <li key={`room-${r.id}`} className="rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-950/30">
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
                </li>
              ))}
              {!topRooms.length ? <li className="text-sm ui-page-muted">No rooms yet.</li> : null}
            </ul>
          </div>

          <div className="ui-animate-pop ui-surface rounded-2xl p-4">
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
        </div>
      </div>
    </div>
  );
}

