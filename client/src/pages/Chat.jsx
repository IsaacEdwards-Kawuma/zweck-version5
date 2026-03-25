import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { createDmRoomByEmail, createGroupRoom, listChatRooms } from "../api/chat";

function roomSubtitle(room) {
  if (room.kind === "MEETING" && room.meetingId) return `Meeting #${room.meetingId}`;
  if (room.kind === "PROJECT" && room.projectId) return `Project #${room.projectId}`;
  return room.kind || "Room";
}

export default function Chat() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [showDmModal, setShowDmModal] = useState(false);
  const [dmEmail, setDmEmail] = useState("");
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState("");

  const qRooms = useQuery({
    queryKey: ["chat_rooms"],
    queryFn: listChatRooms
  });

  const rooms = useMemo(() => qRooms.data || [], [qRooms.data]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => (r.title || "").toLowerCase().includes(q) || roomSubtitle(r).toLowerCase().includes(q));
  }, [rooms, filter]);

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
      setGroupMembers("");
      if (data?.roomId) navigate(`/chat/rooms/${data.roomId}`);
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Chat</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">1:1 chats, group discussions, and meeting/project rooms.</p>
        </div>
        <input
          className="ui-input min-w-[240px]"
          placeholder="Search rooms..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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
          onClick={() => setShowGroupModal(true)}
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
                <div className="truncate font-medium text-slate-900 dark:text-slate-100">{r.title || "(untitled)"}</div>
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
                <span className="font-medium">{new Date(r.lastMessage.createdAt).toLocaleDateString()}:</span>{" "}
                {r.lastMessage.body}
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
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Comma-separated member emails.</div>
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
                const emails = groupMembers
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                mCreateGroup.mutate({ title: t, memberEmails: emails });
              }}
            >
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Group title
                <input className="ui-input mt-1 w-full" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="e.g. Meeting follow-ups" />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Members (emails)
                <input className="ui-input mt-1 w-full" value={groupMembers} onChange={(e) => setGroupMembers(e.target.value)} placeholder="a@x.com, b@x.com" />
              </label>
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

