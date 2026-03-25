import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import {
  addChatRoomMember,
  deleteChatMessage,
  getChatReadReceipts,
  getChatRoomSummary,
  listChatRoomMembers,
  listChatRoomMessages,
  patchChatMessage,
  removeChatRoomMember,
  searchChatMessages,
  toggleChatReaction,
  uploadChatAttachment
} from "../api/chat";

function resolveSocketURL() {
  const env = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV) return undefined;
  if (!env || !/^https:\/\//i.test(env) || /localhost|127\.0\.0\.1/i.test(env)) return undefined;
  let u = env.replace(/\/+$/, "");
  if (u.endsWith("/api")) u = u.slice(0, -3);
  return u;
}

function publicAssetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

// Emoji "stickers" for the quick reaction picker.
// Keep them as single unicode characters so backend emoji handling remains predictable.
const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "🙏", "👏", "🤩", "😡", "💯", "🤝", "🚀"];
const LONG_PRESS_MS = 520;
const LONG_PRESS_MOVE_CANCEL_PX = 14;

function targetAllowsLongPress(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("button, a, input, textarea, label, [data-no-longpress]")) return false;
  return true;
}

export default function ChatRoom() {
  const { roomId } = useParams();
  const { me } = useOutletContext() || {};
  const qc = useQueryClient();

  const numericRoomId = Number(roomId);
  const token = localStorage.getItem("zweck_token");

  const qSummary = useQuery({
    queryKey: ["chat_room_summary", roomId],
    queryFn: () => getChatRoomSummary(numericRoomId),
    enabled: Number.isFinite(numericRoomId) && Boolean(token)
  });

  const qMessages = useQuery({
    queryKey: ["chat_room_messages", roomId],
    queryFn: () => listChatRoomMessages(numericRoomId, { limit: 50 }),
    enabled: Number.isFinite(numericRoomId) && Boolean(token)
  });

  const qMembers = useQuery({
    queryKey: ["chat_room_members", roomId],
    queryFn: () => listChatRoomMembers(numericRoomId),
    enabled: Number.isFinite(numericRoomId) && Boolean(token) && qSummary.data?.kind === "GROUP"
  });

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const isPrependingRef = useRef(false);
  const lastMarkedReadIdRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const longPressRef = useRef({ timer: null, startX: 0, startY: 0 });
  const [typingUsers, setTypingUsers] = useState({});
  const [searchQ, setSearchQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showReaders, setShowReaders] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const fileInputRef = useRef(null);

  const room = qSummary.data;
  const canManageGroup =
    room?.kind === "GROUP" && (me?.role === "ADMIN" || (room.createdById != null && room.createdById === me?.id));

  useEffect(() => {
    if (qMessages.data?.items) {
      setMessages(qMessages.data.items);
      setNextCursor(qMessages.data.nextCursor ?? null);
    }
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
        if (prev.some((p) => p.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => {
        if (msg?.id) {
          lastMarkedReadIdRef.current = msg.id;
          socket.emit("chat:markRead", { roomId: numericRoomId, lastMessageId: msg.id });
        }
      }, 0);
    });

    socket.on("chat:messageUpdated", (msg) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
    });

    socket.on("chat:messageDeleted", ({ id }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });

    socket.on("chat:messageReactionsUpdated", ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: reactions || [] } : m)));
    });

    socket.on("chat:typing", ({ roomId: rid, userId, userEmail, typing }) => {
      if (rid !== numericRoomId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (typing) next[userId] = userEmail || `User #${userId}`;
        else delete next[userId];
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, numericRoomId, socketURL]);

  useEffect(() => {
    if (!messages.length || !socketRef.current) return;
    const last = messages[messages.length - 1];
    if (!last?.id) return;
    if (lastMarkedReadIdRef.current === last.id) return;
    lastMarkedReadIdRef.current = last.id;
    socketRef.current.emit("chat:markRead", { roomId: numericRoomId, lastMessageId: last.id });
  }, [messages, numericRoomId]);

  useEffect(() => {
    if (isPrependingRef.current) return;
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const emitTyping = useCallback(
    (typing) => {
      if (!socketRef.current) return;
      socketRef.current.emit("chat:typing", { roomId: numericRoomId, typing });
    },
    [numericRoomId]
  );

  const clearLongPressTimer = useCallback(() => {
    if (longPressRef.current.timer != null) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  }, []);

  const startMessageLongPress = useCallback(
    (e, messageId) => {
      if (editingId === messageId) return;
      // Don't start long-press on non-primary mouse buttons (e.g. right-click).
      if (typeof e.button === "number" && e.button !== 0) return;
      if (!targetAllowsLongPress(e.target)) return;
      clearLongPressTimer();
      longPressRef.current.startX = e.clientX;
      longPressRef.current.startY = e.clientY;
      longPressRef.current.timer = window.setTimeout(() => {
        longPressRef.current.timer = null;
        setReactionPickerMessageId(messageId);
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
        } catch {
          /* ignore */
        }
      }, LONG_PRESS_MS);
    },
    [editingId, clearLongPressTimer]
  );

  const onMessagePointerMove = useCallback(
    (e) => {
      if (longPressRef.current.timer == null) return;
      const dx = Math.abs(e.clientX - longPressRef.current.startX);
      const dy = Math.abs(e.clientY - longPressRef.current.startY);
      if (dx > LONG_PRESS_MOVE_CANCEL_PX || dy > LONG_PRESS_MOVE_CANCEL_PX) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer]
  );

  const endMessageLongPress = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  useEffect(() => {
    if (reactionPickerMessageId == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setReactionPickerMessageId(null);
    };
    const onDocPointerDown = (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".chat-reaction-picker")) return;
      setReactionPickerMessageId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, [reactionPickerMessageId]);

  const onDraftChange = (e) => {
    setDraft(e.target.value);
    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2000);
  };

  const loadOlderMessages = async () => {
    if (!nextCursor || isLoadingOlder) return;
    const el = scrollRef.current;
    if (!el) return;

    setIsLoadingOlder(true);
    isPrependingRef.current = true;

    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;

    try {
      const data = await listChatRoomMessages(numericRoomId, { limit: 50, cursor: nextCursor });
      const older = data?.items ?? [];
      if (older.length) {
        setMessages((prev) => [...older, ...prev]);
      }
      setNextCursor(data?.nextCursor ?? null);
    } finally {
      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        if (el2) {
          const newScrollHeight = el2.scrollHeight;
          el2.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
        }
        isPrependingRef.current = false;
        setIsLoadingOlder(false);
      });
    }
  };

  const mPatch = useMutation({
    mutationFn: ({ messageId, body }) => patchChatMessage(numericRoomId, messageId, body),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["chat_room_messages", roomId] });
    }
  });

  const mDelete = useMutation({
    mutationFn: (messageId) => deleteChatMessage(numericRoomId, messageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_room_messages", roomId] })
  });

  const mReaction = useMutation({
    mutationFn: ({ messageId, emoji }) => toggleChatReaction(numericRoomId, messageId, emoji)
  });

  const mAddMember = useMutation({
    mutationFn: (email) => addChatRoomMember(numericRoomId, email),
    onSuccess: () => {
      setAddMemberEmail("");
      qc.invalidateQueries({ queryKey: ["chat_room_members", roomId] });
    }
  });

  const mRemoveMember = useMutation({
    mutationFn: (userId) => removeChatRoomMember(numericRoomId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_room_members", roomId] })
  });

  const mSearch = useMutation({
    mutationFn: (q) => searchChatMessages(numericRoomId, { q, limit: 30 })
  });

  const title = room?.title || `Room #${numericRoomId}`;
  const typingLabel = Object.values(typingUsers).filter(Boolean).join(", ");

  if (qSummary.isLoading || qMessages.isLoading) return <Loading label="Loading chat..." />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qMessages.error) return <ErrorBanner error={qMessages.error} />;

  return (
    <div className="flex min-h-[60vh] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {room?.kind || "Room"} · #{numericRoomId}
          </p>
          {typingLabel ? (
            <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">{typingLabel} typing…</p>
          ) : null}
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Long-press a message (or right-click on desktop) to react with an emoji.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-btn-outline text-xs" onClick={() => setShowSearch((v) => !v)}>
            Search
          </button>
          {canManageGroup ? (
            <button type="button" className="ui-btn-outline text-xs" onClick={() => setShowMembers(true)}>
              Members
            </button>
          ) : null}
        </div>
      </div>

      {showSearch ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30">
          <input
            className="ui-input min-w-[200px] flex-1"
            placeholder="Search messages in this room…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const q = searchQ.trim();
                if (q) mSearch.mutate(q);
              }
            }}
          />
          <button
            type="button"
            className="ui-btn-outline"
            disabled={mSearch.isPending || !searchQ.trim()}
            onClick={() => mSearch.mutate(searchQ.trim())}
          >
            Find
          </button>
          {mSearch.data?.items?.length ? (
            <ul className="w-full max-h-40 space-y-1 overflow-auto text-left text-xs text-slate-700 dark:text-slate-200">
              {mSearch.data.items.map((row) => (
                <li key={row.id} className="truncate rounded border border-slate-100 px-2 py-1 dark:border-slate-700">
                  #{row.id}: {row.body?.slice(0, 120) || "(attachment)"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-[320px] flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          if (el.scrollTop < 40 && nextCursor && !isLoadingOlder) {
            loadOlderMessages();
          }
        }}
      >
        {messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No messages yet.</div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const isMe = m.senderId === me?.id;
              return (
                <li key={m.id} className={isMe ? "text-right" : "text-left"}>
                  <div
                    className={
                      isMe
                        ? "relative inline-block max-w-[min(100%,28rem)] rounded-xl bg-brand-50 px-3 py-2 text-left touch-manipulation dark:bg-brand-950/30"
                        : "relative inline-block max-w-[min(100%,28rem)] rounded-xl bg-slate-50 px-3 py-2 text-left touch-manipulation dark:bg-slate-800/40"
                    }
                    onPointerDown={(e) => startMessageLongPress(e, m.id)}
                    onPointerMove={onMessagePointerMove}
                    onPointerUp={endMessageLongPress}
                    onPointerCancel={endMessageLongPress}
                    onContextMenu={(e) => {
                      if (editingId === m.id) return;
                      if (!targetAllowsLongPress(e.target)) return;
                      e.preventDefault();
                      clearLongPressTimer();
                      setReactionPickerMessageId(m.id);
                    }}
                  >
                    {reactionPickerMessageId === m.id ? (
                      <div
                        className={`chat-reaction-picker absolute z-30 flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-900 ${
                          isMe ? "bottom-full right-0 mb-1" : "bottom-full left-0 mb-1"
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {QUICK_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            className="rounded-full px-2 py-1 text-lg leading-none hover:bg-brand-50 dark:hover:bg-brand-950/50"
                            onClick={() => {
                              mReaction.mutate({ messageId: m.id, emoji: em });
                              setReactionPickerMessageId(null);
                            }}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {isMe ? "You" : m.senderEmail || `User #${m.senderId}`}
                    </div>
                    {editingId === m.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className="ui-input min-h-[48px] w-full resize-none"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="ui-btn-outline text-xs"
                            onClick={() => {
                              mPatch.mutate({ messageId: m.id, body: editDraft });
                            }}
                          >
                            Save
                          </button>
                          <button type="button" className="ui-btn-outline text-xs" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.attachmentUrl && m.attachmentKind === "IMAGE" ? (
                          <a
                            href={publicAssetUrl(m.attachmentUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block"
                          >
                            <img
                              src={publicAssetUrl(m.attachmentUrl)}
                              alt=""
                              className="max-h-48 max-w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-600"
                            />
                          </a>
                        ) : null}
                        {m.attachmentUrl && m.attachmentKind === "FILE" ? (
                          <a
                            href={publicAssetUrl(m.attachmentUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-sm text-brand-700 underline dark:text-brand-300"
                          >
                            {m.attachmentName || "Download file"}
                          </a>
                        ) : null}
                        {m.body ? (
                          <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900 dark:text-slate-100">
                            {m.body}
                          </div>
                        ) : null}
                      </>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                      {m.editedAt ? <span>(edited)</span> : null}
                      <button
                        type="button"
                        className="text-brand-700 hover:underline dark:text-brand-300"
                        onClick={async () => {
                          const data = await getChatReadReceipts(numericRoomId, m.id);
                          setShowReaders(data);
                        }}
                      >
                        Read receipts
                      </button>
                    </div>
                    {editingId !== m.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {isMe ? (
                          <>
                            <button
                              type="button"
                              data-no-longpress
                              className="ml-1 text-xs text-brand-700 hover:underline dark:text-brand-300"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditDraft(m.body || "");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              data-no-longpress
                              className="text-xs text-rose-600 hover:underline"
                              onClick={() => {
                                if (window.confirm("Delete this message?")) mDelete.mutate(m.id);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {m.reactions?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-600 dark:text-slate-300">
                        {Object.entries(
                          m.reactions.reduce((acc, r) => {
                            const k = r.emoji;
                            acc[k] = (acc[k] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([emoji, count]) => (
                          <span key={emoji} className="rounded-full bg-brand-100 px-2 py-0.5 dark:bg-brand-900/40">
                            {emoji} {count}
                          </span>
                        ))}
                      </div>
                    ) : null}
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
          emitTyping(false);
          setDraft("");
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={async (ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = "";
            if (!f || !socketRef.current) return;
            try {
              const up = await uploadChatAttachment(numericRoomId, f);
              socketRef.current.emit(
                "chat:sendMessage",
                {
                  roomId: numericRoomId,
                  body: draft.trim() || " ",
                  attachmentUrl: up.attachmentUrl,
                  attachmentKind: up.attachmentKind,
                  attachmentName: up.attachmentName,
                  attachmentSize: up.attachmentSize
                },
                (ack) => {
                  if (!ack?.ok) {
                    // eslint-disable-next-line no-console
                    console.warn("send failed", ack);
                  }
                }
              );
              setDraft("");
              emitTyping(false);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn("upload failed", err);
            }
          }}
        />
        <button type="button" className="ui-btn-outline shrink-0" onClick={() => fileInputRef.current?.click()}>
          Attach
        </button>
        <textarea
          className="ui-input min-h-[48px] flex-1 resize-none"
          placeholder="Write a message..."
          value={draft}
          onChange={onDraftChange}
        />
        <button type="submit" className="ui-btn-outline">
          Send
        </button>
      </form>

      {showReaders ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Read by</div>
              <button type="button" className="ui-btn-outline-xs" onClick={() => setShowReaders(null)}>
                Close
              </button>
            </div>
            <ul className="mt-3 max-h-60 space-y-1 overflow-auto text-sm text-slate-700 dark:text-slate-200">
              {(showReaders.readers || []).map((r) => (
                <li key={r.userId}>{r.email}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {showMembers && canManageGroup ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Group members</div>
              <button type="button" className="ui-btn-outline-xs" onClick={() => setShowMembers(false)}>
                Close
              </button>
            </div>
            {qMembers.isLoading ? (
              <div className="mt-3 text-sm text-slate-600">Loading…</div>
            ) : (
              <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-sm">
                {(qMembers.data?.members || []).map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.email}</span>
                    {m.userId !== room?.createdById ? (
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        disabled={mRemoveMember.isPending}
                        onClick={() => {
                          if (window.confirm("Remove this member?")) mRemoveMember.mutate(m.userId);
                        }}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Creator</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const em = addMemberEmail.trim();
                if (em) mAddMember.mutate(em);
              }}
            >
              <input
                className="ui-input flex-1"
                placeholder="user@email.com"
                value={addMemberEmail}
                onChange={(e) => setAddMemberEmail(e.target.value)}
              />
              <button type="submit" className="ui-btn-outline" disabled={mAddMember.isPending}>
                Add
              </button>
            </form>
            {mAddMember.error || mRemoveMember.error ? (
              <div className="mt-2 text-xs text-rose-600">{String(mAddMember.error || mRemoveMember.error)}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
