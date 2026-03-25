import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { createDmRoomByEmail, createGroupRoom, listChatRooms, listChatUsers, markAllChatRoomsRead } from "../api/chat";

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
    queryKey: ["chat_rooms"],
    queryFn: listChatRooms
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

  if (qRooms.isLoading) return <Loading label="Loading chat rooms..." />;
  if (qRooms.error) return <ErrorBanner error={qRooms.error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Chat</h1>
            {totalUnread > 0 ? (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white" title="Unread across all rooms">
                {totalUnread > 99 ? "99+" : totalUnread} unread
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            1:1 chats, group discussions, and meeting/project rooms.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            className="ui-input min-w-[160px]"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            title="Sort rooms"
          >
            <option value="recent">Sort: Recent activity</option>
            <option value="unread_first">Sort: Unread first</option>
            <option value="alpha">Sort: A–Z</option>
          </select>
          <select
            className="ui-input min-w-[150px]"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            <option value="ALL">All types</option>
            <option value="DM">DM</option>
            <option value="GROUP">Group</option>
            <option value="MEETING">Meeting</option>
            <option value="PROJECT">Project</option>
          </select>
          <input className="ui-input min-w-[240px]" placeholder="Search rooms..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button type="button" className="ui-btn-outline" onClick={() => mMarkAllRead.mutate()} disabled={mMarkAllRead.isPending}>
            Mark all chats read
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="ui-btn-outline"
          onClick={() => setShowDmModal(true)}
          disabled={mCreateDm.isPending}
        >
          New chat
        </button>
        <button
          type="button"
          className="ui-btn-outline"
          onClick={() => {
            setShowGroupModal(true);
            setGroupTitle("");
            setGroupMembersSelected([]);
            setGroupUserSearch("");
          }}
          disabled={mCreateGroup.isPending}
        >
          New group
        </button>
      </div>

      {sortedFiltered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          {rooms.length === 0 ? "No chat rooms yet. Start a direct message or group, or open a meeting/project room." : "No rooms match your filters."}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {sortedFiltered.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-slate-200 bg-white/70 text-left transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:border-brand-600/60"
          >
            <button
              type="button"
              className="w-full p-4 pb-2 text-left"
              onClick={() => navigate(`/chat/rooms/${r.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900/50 dark:text-brand-100"
                    aria-hidden
                  >
                    {roomAvatarLetters(r)}
                  </div>
                  <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                      {kindLabel(r.kind)}
                    </span>
                    <div className="truncate font-medium text-slate-900 dark:text-slate-100">{r.title || "(untitled)"}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{roomSubtitle(r)}</div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.lastMessage ? (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400" title={new Date(r.lastMessage.createdAt).toLocaleString()}>
                      {formatRelativeTime(r.lastMessage.createdAt)}
                    </span>
                  ) : null}
                  {r.unreadCount ? (
                    <div className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {r.unreadCount > 99 ? "99+" : r.unreadCount}
                    </div>
                  ) : null}
                </div>
              </div>

              {r.lastMessage ? (
                <div className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-medium">
                    {new Date(r.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>{" "}
                  {r.lastMessage.senderEmail ? <span className="font-medium">{r.lastMessage.senderEmail}:</span> : null} {r.lastMessage.body}
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">No messages yet.</div>
              )}
            </button>
            <div className="flex items-center justify-end border-t border-slate-100 px-4 py-2 dark:border-slate-700/80">
              <button
                type="button"
                className="text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300"
                onClick={() => {
                  const path = `${window.location.origin}/chat/rooms/${r.id}`;
                  void navigator.clipboard.writeText(path).catch(() => {});
                }}
              >
                Copy link
              </button>
            </div>
          </div>
        ))}
      </div>

      {showDmModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">New chat</div>
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
      ) : null}

      {showGroupModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">New group</div>
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
      ) : null}
    </div>
  );
}

