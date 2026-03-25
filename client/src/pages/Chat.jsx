import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listChatRooms } from "../api/chat";

function roomSubtitle(room) {
  if (room.kind === "MEETING" && room.meetingId) return `Meeting #${room.meetingId}`;
  if (room.kind === "PROJECT" && room.projectId) return `Project #${room.projectId}`;
  return room.kind || "Room";
}

export default function Chat() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Chat</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Creator + leader-only discussions for meetings and projects.</p>
        </div>
        <input
          className="ui-input min-w-[240px]"
          placeholder="Search rooms..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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
    </div>
  );
}

