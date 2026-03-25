import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import { listChatRoomMessages } from "../api/chat";

function resolveSocketURL() {
  const env = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV) return undefined;
  if (!env || !/^https:\/\//i.test(env) || /localhost|127\.0\.0\.1/i.test(env)) return undefined;
  let u = env.replace(/\/+$/, "");
  if (u.endsWith("/api")) u = u.slice(0, -3);
  return u;
}

export default function ChatRoom() {
  const { roomId } = useParams();
  const { me } = useOutletContext();

  const numericRoomId = Number(roomId);
  const token = localStorage.getItem("zweck_token");

  const qMessages = useQuery({
    queryKey: ["chat_room_messages", roomId],
    queryFn: () => listChatRoomMessages(numericRoomId, { limit: 100 }),
    enabled: Number.isFinite(numericRoomId) && Boolean(token)
  });

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (qMessages.data?.items) setMessages(qMessages.data.items);
  }, [qMessages.data]);

  const socketURL = useMemo(() => resolveSocketURL(), []);

  useEffect(() => {
    if (!token || !Number.isFinite(numericRoomId)) return;
    const socket = io(socketURL, {
      auth: { token },
      transports: ["websocket"]
    });
    socketRef.current = socket;

    socket.emit("chat:join", { roomId: numericRoomId }, (ack) => {
      if (!ack?.ok) {
        // eslint-disable-next-line no-console
        console.warn("chat join failed", ack);
      }
    });

    socket.on("chat:messageCreated", (msg) => {
      setMessages((prev) => {
        // Avoid duplicates if server echoes or client reconnects.
        if (prev.some((p) => p.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => {
        if (msg?.id) socket.emit("chat:markRead", { roomId: numericRoomId, lastMessageId: msg.id });
      }, 0);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, numericRoomId, socketURL]);

  useEffect(() => {
    // When user opens this room, mark the latest loaded message as read.
    if (!messages.length || !socketRef.current) return;
    const last = messages[messages.length - 1];
    socketRef.current.emit("chat:markRead", { roomId: numericRoomId, lastMessageId: last.id });
  }, [messages, numericRoomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (qMessages.isLoading) return <Loading label="Loading messages..." />;
  if (qMessages.error) return <ErrorBanner error={qMessages.error} />;

  return (
    <div className="flex min-h-[60vh] flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Discussion</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Room #{numericRoomId}</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-[320px] flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
      >
        {messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No messages yet.</div>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => {
              const isMe = m.senderId === me?.id;
              return (
                <li key={m.id} className={isMe ? "text-right" : "text-left"}>
                  <div className={isMe ? "inline-block rounded-xl bg-brand-50 px-3 py-2 dark:bg-brand-950/30" : "inline-block rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/40"}>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {isMe ? "You" : m.senderEmail || `User #${m.senderId}`}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-slate-100">{m.body}</div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{new Date(m.createdAt).toLocaleString()}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
        onSubmit={(e) => {
          e.preventDefault();
          const body = draft.trim();
          if (!body) return;
          if (!socketRef.current) return;
          socketRef.current.emit("chat:sendMessage", { roomId: numericRoomId, body }, (ack) => {
            if (!ack?.ok) {
              // eslint-disable-next-line no-console
              console.warn("send failed", ack);
            }
          });
          setDraft("");
        }}
      >
        <textarea
          className="ui-input min-h-[48px] flex-1 resize-none"
          placeholder="Write a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="ui-btn-outline">
          Send
        </button>
      </form>
    </div>
  );
}

