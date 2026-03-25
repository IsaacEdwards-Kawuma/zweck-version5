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

export default function Chat() {
  const { me } = useOutletContext() || {};
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [showDmModal, setShowDmModal] = useState(false);
  const [dmEmail, setDmEmail] = useState("");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembersSelected, setGroupMembersSelected] = useState([]);
  const [groupUserSearch, setGroupUserSearch] = useState("");

  const qUsers = useQuery({
    queryKey: ["chat_users"],
    queryFn: listChatUsers,
    enabled: showGroupModal
  });

  const qRooms = useQuery({
    queryKey: ["chat_rooms"],
    queryFn: listChatRooms
  });

  const rooms = useMemo(() => qRooms.data || [], [qRooms.data]);
  const selectedGroupMembers = useMemo(() => {
    const users = qUsers.data?.users ?? [];
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

  if (qRooms.isLoading) return <Loading label="Loading chat rooms..." />;
  if (qRooms.error) return <ErrorBanner error={qRooms.error} />;

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Chat</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">1:1 chats, group discussions, and meeting/project rooms.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white/60 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          No chat rooms available.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            className="rounded-xl border border-slate-200 bg-white/70 p-4 text-left transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:border-brand-600/60"
            onClick={() => navigate(`/chat/rooms/${r.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
                    {kindLabel(r.kind)}
                  </span>
                  <div className="truncate font-medium text-slate-900 dark:text-slate-100">{r.title || "(untitled)"}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{roomSubtitle(r)}</div>
              </div>
              {r.unreadCount ? (
                <div className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {r.unreadCount > 99 ? "99+" : r.unreadCount}
                </div>
              ) : null}
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
              <button type="button" className="ui-btn-outline-xs" onClick={() => setShowDmModal(false)} disabled={mCreateDm.isPending}>
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
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Recipient email
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
                const users = qUsers.data?.users ?? [];
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
                    {(qUsers.data?.users ?? [])
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

