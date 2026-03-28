import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import {
  createDmRoomByEmail,
  createGroupRoom,
  listChatBlocks,
  listChatRooms,
  listChatUsers,
  markAllChatRoomsRead,
  unblockChatUser
} from "../api/chat";
import { isE2eeAttachmentKind, isE2eeEncryptedBody } from "../lib/chatE2ee";

function kindLabel(kind) {
  switch (kind) {
    case "DM":
      return "DM";
    case "GROUP":
      return "Group";
    case "MEETING":
      return "Meeting";
    case "PROJECT":
      return "Project";
    default:
      return kind || "Room";
  }
}

function kindEmoji(kind) {
  switch (kind) {
    case "DM":
      return "💬";
    case "GROUP":
      return "👥";
    case "MEETING":
      return "📅";
    case "PROJECT":
      return "📁";
    default:
      return "◆";
  }
}

function roomSubtitle(room) {
  if (room.kind === "MEETING" && room.meetingId) return `Meeting #${room.meetingId}`;
  if (room.kind === "PROJECT" && room.projectId) return `Project #${room.projectId}`;
  return room.kind || "Room";
}

function roomAvatarLetters(room) {
  const t = (room.title || room.roomKey || "?").trim();
  if (t.length <= 2) return t.toUpperCase() || "?";
  return t.slice(0, 2).toUpperCase();
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function sortRooms(list, mode) {
  const copy = [...list];
  const lastTs = (r) => (r.lastMessage?.createdAt ? new Date(r.lastMessage.createdAt).getTime() : 0);
  if (mode === "alpha") {
    copy.sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
    return copy;
  }
  if (mode === "unread_first") {
    copy.sort((a, b) => {
      const ua = Number(a.unreadCount) || 0;
      const ub = Number(b.unreadCount) || 0;
      if (ub !== ua) return ub - ua;
      return lastTs(b) - lastTs(a);
    });
    return copy;
  }
  // recent
  copy.sort((a, b) => lastTs(b) - lastTs(a));
  return copy;
}

export default function Chat() {
  const { me } = useOutletContext() || {};
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState("recent");
  const [showDmModal, setShowDmModal] = useState(false);
  const [dmEmail, setDmEmail] = useState("");
  const [dmUserSearch, setDmUserSearch] = useState("");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembersSelected, setGroupMembersSelected] = useState([]);
  const [groupUserSearch, setGroupUserSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  const qUsers = useQuery({
    queryKey: ["chat_users"],
    queryFn: listChatUsers,
    enabled: showGroupModal
  });

  const qUsersDm = useQuery({
    queryKey: ["chat_users_dm"],
    queryFn: listChatUsers,
    enabled: showDmModal
  });

  const qRooms = useQuery({
    queryKey: ["chat_rooms", showArchived],
    queryFn: () => listChatRooms({ includeArchived: showArchived })
  });

  const qBlocks = useQuery({
    queryKey: ["chat_blocks"],
    queryFn: listChatBlocks,
    enabled: showBlocked
  });

  const rooms = useMemo(() => qRooms.data || [], [qRooms.data]);
  const selectedGroupMembers = useMemo(() => {
    const users = Array.isArray(qUsers.data) ? qUsers.data : [];
    const ids = new Set(groupMembersSelected);
    return users.filter((u) => ids.has(u.id));
  }, [qUsers.data, groupMembersSelected]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rooms.filter((r) => {
      if (kindFilter !== "ALL" && r.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        (r.title || "").toLowerCase().includes(q) ||
        roomSubtitle(r).toLowerCase().includes(q) ||
        (r.kind || "").toLowerCase().includes(q)
      );
    });
  }, [rooms, filter, kindFilter]);

  const sortedFiltered = useMemo(() => sortRooms(filtered, sortMode), [filtered, sortMode]);

  const totalUnread = useMemo(
    () => rooms.reduce((sum, r) => sum + (Number(r.unreadCount) || 0), 0),
    [rooms]
  );

  const mCreateDm = useMutation({
    mutationFn: (payload) => createDmRoomByEmail(payload),
    onSuccess: (data) => {
      setShowDmModal(false);
      setDmEmail("");
      if (data?.roomId) navigate(`/chat/rooms/${data.roomId}`);
    }
  });

  const mCreateGroup = useMutation({
    mutationFn: (payload) => createGroupRoom(payload),
    onSuccess: (data) => {
      setShowGroupModal(false);
      setGroupTitle("");
      setGroupMembersSelected([]);
      setGroupUserSearch("");
      if (data?.roomId) navigate(`/chat/rooms/${data.roomId}`);
    }
  });

  const mMarkAllRead = useMutation({
    mutationFn: () => markAllChatRoomsRead(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
    }
  });

  const mUnblock = useMutation({
    mutationFn: (userId) => unblockChatUser(userId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat_blocks"] });
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
    }
  });

  if (qRooms.isLoading) return <Loading label="Loading chat rooms..." />;
  if (qRooms.error) return <ErrorBanner error={qRooms.error} />;

  return (
    <div className="relative mx-auto max-w-4xl space-y-8 pb-12">
      <div
        className="pointer-events-none absolute -left-6 top-0 h-40 w-40 rounded-full bg-brand-400/10 blur-3xl dark:bg-brand-500/15 sm:-left-10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-4 top-24 h-32 w-32 rounded-full bg-accent-400/15 blur-3xl dark:bg-accent-500/10 sm:-right-8"
        aria-hidden
      />

      <header className="ui-animate-in relative space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/20 via-white/80 to-accent-400/25 text-2xl shadow-sm ring-1 ring-brand-500/15 dark:from-brand-400/15 dark:via-slate-900/80 dark:to-accent-500/20 dark:ring-brand-400/20"
            aria-hidden
          >
            💬
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Chat</h1>
              {totalUnread > 0 ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white shadow-md ring-2 ring-rose-500/30 motion-safe:animate-pulse"
                  title="Unread across all rooms"
                >
                  <span aria-hidden>🔔</span>
                  {totalUnread > 99 ? "99+" : totalUnread} new
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200/90">
                  <span className="mr-1" aria-hidden>
                    ✓
                  </span>
                  All caught up
                </span>
              )}
            </div>
            <div
              className="h-1 w-24 rounded-full bg-gradient-to-r from-brand-500 via-sky-400 to-accent-400 opacity-90 shadow-sm"
              aria-hidden
            />
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {showArchived
                ? "You’re viewing archived rooms. Unarchive from inside a room to bring it back to your main list."
                : "Direct messages, groups, and linked meeting or project rooms — all in one place."}
            </p>
          </div>
        </div>
      </header>

      <div className="motion-safe:ui-animate-in motion-safe:[animation-delay:70ms] flex flex-wrap gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-brand-700 hover:shadow-lg active:scale-[0.99] disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
          onClick={() => setShowDmModal(true)}
          disabled={mCreateDm.isPending}
        >
          <span aria-hidden className="text-base leading-none">
            ✉️
          </span>
          New chat
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-brand-300/60 hover:bg-slate-50 hover:shadow-md active:scale-[0.99] disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-600/50 dark:hover:bg-slate-800"
          onClick={() => {
            setShowGroupModal(true);
            setGroupTitle("");
            setGroupMembersSelected([]);
            setGroupUserSearch("");
          }}
          disabled={mCreateGroup.isPending}
        >
          <span aria-hidden className="text-base leading-none">
            👥
          </span>
          New group
        </button>
      </div>

      <section className="motion-safe:ui-animate-in motion-safe:[animation-delay:120ms] rounded-2xl border border-slate-200/90 bg-white/70 p-4 shadow-md backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/30 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span aria-hidden>↕️</span> Sort
            </label>
            <select
              className="ui-input w-full"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              title="Sort rooms"
            >
              <option value="recent">Recent activity</option>
              <option value="unread_first">Unread first</option>
              <option value="alpha">Name A–Z</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</label>
            <select className="ui-input w-full" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="ALL">All types</option>
              <option value="DM">DM</option>
              <option value="GROUP">Group</option>
              <option value="MEETING">Meeting</option>
              <option value="PROJECT">Project</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span aria-hidden>🔍</span> Search
            </label>
            <input
              className="ui-input w-full"
              placeholder="Filter by title or room…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
          <button
            type="button"
            className={
              showArchived
                ? "rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            }
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? "Show active chats" : "Show archived chats"}
          >
            {showArchived ? "Archived (on)" : "Show archived"}
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-800"
            onClick={() => setShowBlocked(true)}
          >
            Blocked users
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/40"
            onClick={() => mMarkAllRead.mutate()}
            disabled={mMarkAllRead.isPending}
          >
            Mark all read
          </button>
        </div>
      </section>

      {sortedFiltered.length === 0 ? (
        <div className="ui-animate-in rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white/50 px-6 py-14 text-center text-sm text-slate-600 shadow-inner dark:border-slate-600 dark:from-slate-900/40 dark:to-slate-950/30 dark:text-slate-400">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-600" aria-hidden>
            📭
          </div>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {rooms.length === 0
              ? "No conversations yet. Start with New chat or New group above."
              : "Nothing matches these filters. Try clearing search or changing the type."}
          </p>
        </div>
      ) : null}

      <ul className="space-y-4">
        {sortedFiltered.map((r, i) => (
          <li
            key={r.id}
            className="group ui-chat-list-item motion-safe:ui-animate-in overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-left shadow-sm hover:border-brand-300/60 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-brand-600/50"
            style={{ animationDelay: `${Math.min(i, 14) * 42}ms` }}
          >
            <button
              type="button"
              className="relative w-full p-5 text-left transition-colors"
              onClick={() => navigate(`/chat/rooms/${r.id}`)}
            >
              <span
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 translate-x-2 text-lg opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:translate-x-0 motion-reduce:opacity-100"
                aria-hidden
              >
                →
              </span>
              <div className="flex items-start gap-4 pr-6">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 text-sm font-bold text-brand-900 shadow-inner ring-1 ring-brand-200/50 dark:from-brand-900/60 dark:to-brand-950/40 dark:text-brand-100 dark:ring-brand-700/40"
                  aria-hidden
                >
                  {roomAvatarLetters(r)}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-800 dark:bg-brand-950/50 dark:text-brand-200">
                      <span aria-hidden className="text-[13px] leading-none">
                        {kindEmoji(r.kind)}
                      </span>
                      {kindLabel(r.kind)}
                    </span>
                    {r.archived ? (
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">{r.title || "(Untitled room)"}</div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{roomSubtitle(r)}</div>
                  </div>
                  {r.lastMessage ? (
                    <div className="line-clamp-2 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600 dark:border-slate-700/80 dark:text-slate-300">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {new Date(r.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {r.lastMessage.senderEmail ? (
                        <span className="font-medium text-slate-700 dark:text-slate-200"> · {r.lastMessage.senderEmail}</span>
                      ) : null}
                      <span className="text-slate-600 dark:text-slate-400">
                        {" "}
                        —{" "}
                        {isE2eeAttachmentKind(r.lastMessage.attachmentKind)
                          ? "Encrypted attachment"
                          : isE2eeEncryptedBody(r.lastMessage.body)
                            ? "Encrypted message"
                            : r.lastMessage.body}
                      </span>
                    </div>
                  ) : (
                    <div className="border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-slate-700/80 dark:text-slate-400">
                      No messages yet — say hello.
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {r.lastMessage ? (
                    <time
                      className="text-xs text-slate-400 dark:text-slate-500"
                      dateTime={r.lastMessage.createdAt}
                      title={new Date(r.lastMessage.createdAt).toLocaleString()}
                    >
                      {formatRelativeTime(r.lastMessage.createdAt)}
                    </time>
                  ) : null}
                  {r.unreadCount ? (
                    <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
                      {r.unreadCount > 99 ? "99+" : r.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-4 py-2 dark:border-slate-800 dark:bg-slate-950/30">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
                onClick={() => {
                  const path = `${window.location.origin}/chat/rooms/${r.id}`;
                  void navigator.clipboard.writeText(path).catch(() => {});
                }}
              >
                <span aria-hidden>🔗</span>
                Copy room link
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showDmModal ? (
        <div className="ui-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="ui-modal-panel w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-200/50 dark:border-slate-700 dark:bg-slate-950/90 dark:ring-slate-700/80">
            <div className="h-1.5 bg-gradient-to-r from-brand-500 via-sky-400 to-accent-400" aria-hidden />
            <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <span aria-hidden>✉️</span> New chat
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Type the other user email.</div>
              </div>
              <button
                type="button"
                className="ui-btn-outline-xs"
                onClick={() => {
                  setShowDmModal(false);
                  setDmUserSearch("");
                }}
                disabled={mCreateDm.isPending}
              >
                Close
              </button>
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const email = dmEmail.trim();
                if (!email) return;
                mCreateDm.mutate({ otherEmail: email });
              }}
            >
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Pick a user</div>
              {qUsersDm.isLoading ? (
                <div className="text-sm text-slate-600 dark:text-slate-300">Loading users...</div>
              ) : qUsersDm.error ? (
                <ErrorBanner error={qUsersDm.error} />
              ) : (
                <div className="max-h-36 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-white/50 p-2 dark:border-slate-700 dark:bg-slate-950/30">
                  <input
                    className="ui-input mb-2 w-full text-sm"
                    placeholder="Filter by email..."
                    value={dmUserSearch}
                    onChange={(e) => setDmUserSearch(e.target.value)}
                  />
                  {(Array.isArray(qUsersDm.data) ? qUsersDm.data : [])
                    .filter((u) => {
                      const qq = dmUserSearch.trim().toLowerCase();
                      if (!qq) return true;
                      return (u.email || "").toLowerCase().includes(qq);
                    })
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-brand-950/40"
                        onClick={() => setDmEmail(u.email)}
                      >
                        {u.email}
                      </button>
                    ))}
                </div>
              )}
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Or enter recipient email
                <input className="ui-input mt-1 w-full" value={dmEmail} onChange={(e) => setDmEmail(e.target.value)} placeholder="user@example.com" />
              </label>
              {mCreateDm.error ? <ErrorBanner error={mCreateDm.error} /> : null}
              <button type="submit" className="ui-btn" disabled={mCreateDm.isPending}>
                Create chat
              </button>
            </form>
            </div>
          </div>
        </div>
      ) : null}

      {showGroupModal ? (
        <div className="ui-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="ui-modal-panel w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-200/50 dark:border-slate-700 dark:bg-slate-950/90 dark:ring-slate-700/80">
            <div className="h-1.5 bg-gradient-to-r from-brand-500 via-sky-400 to-accent-400" aria-hidden />
            <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <span aria-hidden>👥</span> New group
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Pick members from the list.</div>
              </div>
              <button
                type="button"
                className="ui-btn-outline-xs"
                onClick={() => setShowGroupModal(false)}
                disabled={mCreateGroup.isPending}
              >
                Close
              </button>
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const t = groupTitle.trim();
                if (!t) return;
                const users = Array.isArray(qUsers.data) ? qUsers.data : [];
                const emails = users.filter((u) => groupMembersSelected.includes(u.id)).map((u) => u.email);
                mCreateGroup.mutate({ title: t, memberEmails: emails });
              }}
            >
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Group title
                <input className="ui-input mt-1 w-full" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="e.g. Meeting follow-ups" />
              </label>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Members
                  <input
                    className="ui-input mt-1 w-full"
                    value={groupUserSearch}
                    onChange={(e) => setGroupUserSearch(e.target.value)}
                    placeholder="Search users by email..."
                  />
                </label>
                {qUsers.isLoading ? (
                  <div className="text-sm text-slate-600 dark:text-slate-300">Loading users...</div>
                ) : qUsers.error ? (
                  <ErrorBanner error={qUsers.error} />
                ) : (
                  <div className="max-h-44 space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white/50 p-2 dark:border-slate-700 dark:bg-slate-950/30">
                    {(Array.isArray(qUsers.data) ? qUsers.data : [])
                      .filter((u) => {
                        const qq = groupUserSearch.trim().toLowerCase();
                        if (!qq) return true;
                        return (u.email || "").toLowerCase().includes(qq);
                      })
                      .map((u) => {
                        const checked = groupMembersSelected.includes(u.id);
                        return (
                          <label key={u.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...groupMembersSelected, u.id]
                                  : groupMembersSelected.filter((id) => id !== u.id);
                                setGroupMembersSelected(next);
                              }}
                            />
                            <span className="truncate">{u.email}</span>
                          </label>
                        );
                      })}
                  </div>
                )}
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Selected: <span className="font-semibold">{groupMembersSelected.length}</span>
                  {me ? <span className="ml-1">(you are included automatically)</span> : null}
                </div>
                {selectedGroupMembers.length ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedGroupMembers.map((u) => (
                      <span key={u.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-200">
                        {u.email}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {mCreateGroup.error ? <ErrorBanner error={mCreateGroup.error} /> : null}
              <button type="submit" className="ui-btn" disabled={mCreateGroup.isPending}>
                Create group
              </button>
            </form>
            </div>
          </div>
        </div>
      ) : null}

      {showBlocked ? (
        <div className="ui-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="ui-modal-panel w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-200/50 dark:border-slate-700 dark:bg-slate-950/90 dark:ring-slate-700/80">
            <div className="h-1.5 bg-gradient-to-r from-rose-400 via-slate-400 to-brand-500" aria-hidden />
            <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <span aria-hidden>🚫</span> Blocked users
              </div>
              <button type="button" className="ui-btn-outline-xs" onClick={() => setShowBlocked(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Unblock to allow direct messages again. Start a new chat from New chat after unblocking.
            </p>
            {qBlocks.isLoading ? (
              <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">Loading...</div>
            ) : qBlocks.error ? (
              <div className="mt-3">
                <ErrorBanner error={qBlocks.error} />
              </div>
            ) : (qBlocks.data || []).length === 0 ? (
              <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">No blocked users.</div>
            ) : (
              <ul className="mt-3 max-h-60 space-y-2 overflow-auto">
                {(qBlocks.data || []).map((b) => (
                  <li
                    key={b.userId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2 py-2 dark:border-slate-700"
                  >
                    <span className="truncate text-sm text-slate-800 dark:text-slate-200">{b.email}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                      disabled={mUnblock.isPending}
                      onClick={() => mUnblock.mutate(b.userId)}
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

