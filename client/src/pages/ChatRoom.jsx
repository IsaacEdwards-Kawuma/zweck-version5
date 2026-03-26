import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import Loading from "../components/Loading";
import ErrorBanner from "../components/ErrorBanner";
import {
  addChatRoomMember,
  archiveChatRoom,
  blockChatUser,
  clearChatHistory,
  deleteChatMessage,
  getChatReadReceipts,
  getChatRoomPresence,
  getChatRoomSummary,
  leaveChatRoom,
  listChatRoomMembers,
  listChatRoomMessages,
  patchChatMessage,
  removeChatRoomMember,
  searchChatMessages,
  setChatRoomPin,
  toggleChatReaction,
  unarchiveChatRoom,
  uploadChatAttachment
} from "../api/chat";
import MessageBody from "../components/chat/MessageBody";

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
const MORE_EMOJIS = [
  "😀",
  "😁",
  "😊",
  "🙂",
  "😉",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤔",
  "😴",
  "🤒",
  "👀",
  "💪",
  "🙌",
  "✨",
  "⭐",
  "❗",
  "❓",
  "✅",
  "☕",
  "🍕",
  "🎂",
  "📎",
  "📌",
  "💼",
  "📧",
  "🔔",
  "⚡",
  "🌟",
  "🎯",
  "📅",
  "✍️",
  "📝"
];
const LONG_PRESS_MS = 520;
const LONG_PRESS_MOVE_CANCEL_PX = 14;
/** Touch / pen (and mouse drag for testing): horizontal swipe on a bubble starts a reply. */
// Thresholds are tuned for real finger jitter: we primarily need "mostly horizontal".
const SWIPE_REPLY_MIN_PX = 24;
const SWIPE_REPLY_MAX_VERTICAL_PX = 140;
const SWIPE_REPLY_HORIZONTAL_RATIO = 0.75;

function isSwipeReplyPointer(e) {
  if (e.pointerType === "touch" || e.pointerType === "pen") return true;
  // Some WebViews briefly report an empty type on touch pointers.
  if (!e.pointerType && typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
  return false;
}


function targetAllowsLongPress(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("button, a, input, textarea, label, [data-no-longpress]")) return false;
  return true;
}

export default function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
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
  const swipeReplyRef = useRef({
    startX: 0,
    startY: 0,
    messageId: null,
    pointerId: null,
    // True when this gesture was started as touch/pen (pointerup may still complete swipe).
    tracking: false,
    senderEmail: null,
    bodySnippet: null
  });
  const [typingUsers, setTypingUsers] = useState({});
  const [searchQ, setSearchQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showReaders, setShowReaders] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  /** Long-press or right-click: emoji reactions + message actions (copy, pin, star, etc.). */
  const [messageMenuMessageId, setMessageMenuMessageId] = useState(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const fileInputRef = useRef(null);
  const messagesRef = useRef([]);
  const nextCursorRef = useRef(null);
  const [replyTo, setReplyTo] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [presence, setPresence] = useState({ viewerCount: 0, userIds: [] });
  const [starredIds, setStarredIds] = useState(() => new Set());

  const room = qSummary.data;
  const canManageGroup =
    room?.kind === "GROUP" && (me?.role === "ADMIN" || (room.createdById != null && room.createdById === me?.id));
  const canModerate = me?.role === "ADMIN";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`zweck_chat_stars_${roomId}`);
      setStarredIds(new Set(raw ? JSON.parse(raw) : []));
    } catch {
      setStarredIds(new Set());
    }
  }, [roomId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`zweck_chat_draft_${roomId}`);
      setDraft(typeof saved === "string" ? saved : "");
    } catch {
      setDraft("");
    }
  }, [roomId]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`zweck_chat_draft_${roomId}`, draft);
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft, roomId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    if (!Number.isFinite(numericRoomId)) return;
    let cancelled = false;
    async function poll() {
      try {
        const d = await getChatRoomPresence(numericRoomId);
        if (!cancelled && d) {
          setPresence({ viewerCount: d.viewerCount ?? 0, userIds: Array.isArray(d.userIds) ? d.userIds : [] });
        }
      } catch {
        /* ignore */
      }
    }
    poll();
    const iv = setInterval(poll, 45000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [numericRoomId]);

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

    socket.on("chat:presence", (payload) => {
      if (!payload || payload.roomId !== numericRoomId) return;
      setPresence({
        viewerCount: payload.viewerCount ?? 0,
        userIds: Array.isArray(payload.userIds) ? payload.userIds : []
      });
    });

    socket.on("chat:roomUpdated", () => {
      qc.invalidateQueries({ queryKey: ["chat_room_summary", roomId] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, numericRoomId, socketURL, qc, roomId]);

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
        setMessageMenuMessageId(messageId);
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
      // Swipe-to-reply: trigger as soon as the gesture looks valid.
      // This avoids relying on `pointerup` (which can be cancelled/suppressed by some WebViews).
      const s = swipeReplyRef.current;
      if (s.tracking && s.pointerId != null && e.pointerId === s.pointerId && s.messageId != null) {
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absY <= SWIPE_REPLY_MAX_VERTICAL_PX && absX >= SWIPE_REPLY_MIN_PX && absX >= absY * SWIPE_REPLY_HORIZONTAL_RATIO) {
          swipeReplyRef.current = {
            startX: 0,
            startY: 0,
            messageId: null,
            pointerId: null,
            tracking: false,
            senderEmail: null,
            bodySnippet: null
          };
          endMessageLongPress();
          setReplyTo({
            id: s.messageId,
            senderEmail: s.senderEmail,
            bodySnippet: s.bodySnippet || ""
          });
          try {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
          } catch {
            /* ignore */
          }
          return;
        }
      }

      if (longPressRef.current.timer == null) return;
      const dx = Math.abs(e.clientX - longPressRef.current.startX);
      const dy = Math.abs(e.clientY - longPressRef.current.startY);
      if (dx > LONG_PRESS_MOVE_CANCEL_PX || dy > LONG_PRESS_MOVE_CANCEL_PX) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer, endMessageLongPress]
  );

  const endMessageLongPress = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const onMessageBubblePointerDown = useCallback(
    (e, m) => {
      if (editingId === m.id) return;
      if (!targetAllowsLongPress(e.target)) {
        if (isSwipeReplyPointer(e)) {
          swipeReplyRef.current = {
            startX: 0,
            startY: 0,
            messageId: null,
            pointerId: null,
            tracking: false,
            senderEmail: null,
            bodySnippet: null
          };
        }
        return;
      }
      const messageId = m.id;
      if (isSwipeReplyPointer(e) && e.currentTarget instanceof Element) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      startMessageLongPress(e, messageId);
      if (isSwipeReplyPointer(e)) {
        swipeReplyRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          messageId,
          pointerId: e.pointerId,
          tracking: true,
          senderEmail: m.senderEmail,
          bodySnippet: (m.body || "").slice(0, 200)
        };
      } else {
        swipeReplyRef.current = {
          startX: 0,
          startY: 0,
          messageId: null,
          pointerId: null,
          tracking: false,
          senderEmail: null,
          bodySnippet: null
        };
      }
    },
    [startMessageLongPress, editingId]
  );

  const onMessageBubblePointerUp = useCallback(
    (e, m) => {
      endMessageLongPress();
      if (editingId === m.id) {
        swipeReplyRef.current = {
          startX: 0,
          startY: 0,
          messageId: null,
          pointerId: null,
          tracking: false,
          senderEmail: null,
          bodySnippet: null
        };
        return;
      }
      const s = swipeReplyRef.current;
      if (!s.tracking || s.messageId !== m.id) return;
      if (e.pointerId !== s.pointerId) return;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      swipeReplyRef.current = {
        startX: 0,
        startY: 0,
        messageId: null,
        pointerId: null,
        tracking: false,
        senderEmail: null,
        bodySnippet: null
      };

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absY > SWIPE_REPLY_MAX_VERTICAL_PX) return;
      if (absX < SWIPE_REPLY_MIN_PX) return;
      if (absX < absY * SWIPE_REPLY_HORIZONTAL_RATIO) return;

      setReplyTo({
        id: m.id,
        senderEmail: s.senderEmail || m.senderEmail,
        bodySnippet: s.bodySnippet || (m.body || "").slice(0, 200)
      });
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(22);
      } catch {
        /* ignore */
      }
    },
    [endMessageLongPress, editingId]
  );

  const onMessageBubblePointerCancel = useCallback(
    (e) => {
      endMessageLongPress();
      if (swipeReplyRef.current.pointerId === e.pointerId) {
        swipeReplyRef.current = {
          startX: 0,
          startY: 0,
          messageId: null,
          pointerId: null,
          tracking: false,
          senderEmail: null,
          bodySnippet: null
        };
      }
    },
    [endMessageLongPress]
  );

  useEffect(() => {
    if (messageMenuMessageId == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMessageMenuMessageId(null);
    };
    const onDocPointerDown = (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".chat-message-menu")) return;
      setMessageMenuMessageId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("touchstart", onDocPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("touchstart", onDocPointerDown);
    };
  }, [messageMenuMessageId]);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_room_messages", roomId] });
      qc.invalidateQueries({ queryKey: ["chat_room_summary", roomId] });
    }
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

  const mPin = useMutation({
    mutationFn: (messageId) => setChatRoomPin(numericRoomId, messageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat_room_summary", roomId] })
  });

  const mArchive = useMutation({
    mutationFn: () => archiveChatRoom(numericRoomId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      navigate("/chat");
    }
  });

  const mUnarchive = useMutation({
    mutationFn: () => unarchiveChatRoom(numericRoomId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      await qc.invalidateQueries({ queryKey: ["chat_room_summary", roomId] });
    }
  });

  const mClear = useMutation({
    mutationFn: () => clearChatHistory(numericRoomId),
    onSuccess: async () => {
      setMessages([]);
      setNextCursor(null);
      await qc.invalidateQueries({ queryKey: ["chat_room_messages", roomId] });
      await qc.invalidateQueries({ queryKey: ["chat_room_summary", roomId] });
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
    }
  });

  const mLeave = useMutation({
    mutationFn: () => leaveChatRoom(numericRoomId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      navigate("/chat");
    }
  });

  const mBlock = useMutation({
    mutationFn: (userId) => blockChatUser(userId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      await qc.invalidateQueries({ queryKey: ["chat_blocks"] });
      navigate("/chat");
    }
  });

  const jumpToMessageId = useCallback(
    async (targetId) => {
      setHighlightId(targetId);
      let currentList = messagesRef.current;
      let cursor = nextCursorRef.current;
      while (!currentList.some((m) => m.id === targetId) && cursor) {
        const data = await listChatRoomMessages(numericRoomId, { limit: 50, cursor });
        const older = data?.items ?? [];
        cursor = data?.nextCursor ?? null;
        if (!older.length) break;
        currentList = [...older, ...currentList];
        setMessages(currentList);
        setNextCursor(cursor);
        messagesRef.current = currentList;
        nextCursorRef.current = cursor;
      }
      requestAnimationFrame(() => {
        document.getElementById(`chat-msg-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightId(null), 2800);
      });
    },
    [numericRoomId]
  );

  function toggleStar(messageId) {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      try {
        localStorage.setItem(`zweck_chat_stars_${roomId}`, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const title = room?.title || `Room #${numericRoomId}`;
  const typingLabel = Object.values(typingUsers).filter(Boolean).join(", ");
  const isPublicRoom = room?.kind === "MEETING" || room?.kind === "PROJECT";
  const isDmRoom = room?.kind === "DM";
  const roomArchived = Boolean(room?.membership?.archivedAt);

  if (qSummary.isLoading || qMessages.isLoading) return <Loading label="Loading chat..." />;
  if (qSummary.error) return <ErrorBanner error={qSummary.error} />;
  if (qMessages.error) return <ErrorBanner error={qMessages.error} />;

  return (
    <div className="flex min-h-[60vh] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/chat" className="mb-1 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
            ← All chats
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {room?.kind || "Room"} · #{numericRoomId}
          </p>
          {typingLabel ? (
            <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">{typingLabel} typing…</p>
          ) : null}
          {presence.viewerCount > 0 ? (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {presence.viewerCount} active in this room
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Long-press or right-click to react; use Copy, Reply, star, or pin below each message.
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
          <details className="relative">
            <summary className="ui-btn-outline list-none cursor-pointer select-none text-xs [&::-webkit-details-marker]:hidden">
              Room actions
            </summary>
            <div
              className="absolute right-0 z-40 mt-1 flex min-w-[13.5rem] flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="rounded px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                disabled={mClear.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Clear all messages from your view? Others still keep the full history. New messages will appear normally."
                    )
                  ) {
                    mClear.mutate();
                  }
                }}
              >
                Clear messages
              </button>
              {roomArchived ? (
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  disabled={mUnarchive.isPending}
                  onClick={() => mUnarchive.mutate()}
                >
                  Unarchive chat
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  disabled={mArchive.isPending}
                  onClick={() => {
                    if (window.confirm("Archive this chat? It moves to Archived on the chat list.")) {
                      mArchive.mutate();
                    }
                  }}
                >
                  Archive chat
                </button>
              )}
              {!isPublicRoom ? (
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  disabled={mLeave.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        isDmRoom
                          ? "Delete this chat for you? You can start a new direct message with the same person later."
                          : "Leave this group? You will need to be re-invited to return."
                      )
                    ) {
                      mLeave.mutate();
                    }
                  }}
                >
                  {isDmRoom ? "Delete chat" : "Leave group"}
                </button>
              ) : (
                <p className="px-3 py-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  Meeting/project rooms: use Archive or Clear; you cannot leave.
                </p>
              )}
              {isDmRoom && room?.otherUserId ? (
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  disabled={mBlock.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Block this user? Neither of you can open this chat until someone unblocks from Blocked users."
                      )
                    ) {
                      mBlock.mutate(room.otherUserId);
                    }
                  }}
                >
                  Block user
                </button>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      {room?.pinnedMessageId && room?.pinnedMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/50">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">Pinned</div>
          <div className="mt-1 line-clamp-2 text-slate-800 dark:text-slate-100">
            {room.pinnedMessage.sender?.email ? (
              <span className="font-medium">{room.pinnedMessage.sender.email}: </span>
            ) : null}
            {(room.pinnedMessage.body || "").slice(0, 220)}
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
            onClick={() => jumpToMessageId(room.pinnedMessage.id)}
          >
            Jump to message
          </button>
        </div>
      ) : null}

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
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 rounded border border-slate-100 px-2 py-1 dark:border-slate-700"
                >
                  <span className="min-w-0 flex-1 truncate">
                    #{row.id}: {row.body?.slice(0, 120) || "(attachment)"}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-medium text-brand-700 hover:underline dark:text-brand-300"
                    onClick={() => {
                      setShowSearch(false);
                      jumpToMessageId(row.id);
                    }}
                  >
                    Go to
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        role="region"
        aria-label="Chat messages"
        className="min-h-[320px] flex-1 touch-pan-y overflow-y-auto overscroll-y-contain rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
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
                    id={`chat-msg-${m.id}`}
                    className={
                      (isMe
                        ? "relative inline-block max-w-[min(100%,28rem)] rounded-xl bg-brand-50 px-3 py-2 text-left touch-pan-y dark:bg-brand-950/30"
                        : "relative inline-block max-w-[min(100%,28rem)] rounded-xl bg-slate-50 px-3 py-2 text-left touch-pan-y dark:bg-slate-800/40") +
                      (highlightId === m.id ? " ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-slate-900" : "")
                    }
                    onPointerDown={(e) => onMessageBubblePointerDown(e, m)}
                    onPointerMove={onMessagePointerMove}
                    onPointerUp={(e) => onMessageBubblePointerUp(e, m)}
                    onPointerCancel={onMessageBubblePointerCancel}
                    onContextMenu={(e) => {
                      if (editingId === m.id) return;
                      if (!targetAllowsLongPress(e.target)) return;
                      e.preventDefault();
                      clearLongPressTimer();
                      setMessageMenuMessageId(m.id);
                    }}
                  >
                    {messageMenuMessageId === m.id ? (
                      <div
                        className={`chat-message-menu absolute z-30 flex max-w-[min(96vw,22rem)] flex-col gap-1 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-900 ${
                          isMe ? "bottom-full right-0 mb-1" : "bottom-full left-0 mb-1"
                        }`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Reactions
                        </div>
                        <div className="flex max-w-[min(92vw,18rem)] flex-wrap items-center gap-0.5">
                          {QUICK_EMOJIS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              className="rounded-full px-2 py-1 text-lg leading-none hover:bg-brand-50 dark:hover:bg-brand-950/50"
                              onClick={() => {
                                mReaction.mutate({ messageId: m.id, emoji: em });
                                setMessageMenuMessageId(null);
                              }}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                        <div className="mt-1 max-h-24 w-full overflow-y-auto border-t border-slate-200 pt-1 dark:border-slate-600">
                          <div className="flex flex-wrap gap-0.5">
                            {MORE_EMOJIS.map((em) => (
                              <button
                                key={em}
                                type="button"
                                className="rounded px-1.5 py-0.5 text-base leading-none hover:bg-brand-50 dark:hover:bg-brand-950/50"
                                onClick={() => {
                                  mReaction.mutate({ messageId: m.id, emoji: em });
                                  setMessageMenuMessageId(null);
                                }}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-1 border-t border-slate-200 pt-1.5 dark:border-slate-600">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Message
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px]">
                            <button
                              type="button"
                              data-no-longpress
                              className="text-brand-700 hover:underline dark:text-brand-300"
                              onClick={() => {
                                const t = m.body || m.attachmentName || "";
                                void navigator.clipboard.writeText(t);
                                setMessageMenuMessageId(null);
                              }}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              data-no-longpress
                              className="text-brand-700 hover:underline dark:text-brand-300"
                              onClick={() => {
                                setReplyTo({
                                  id: m.id,
                                  senderEmail: m.senderEmail,
                                  bodySnippet: (m.body || "").slice(0, 200)
                                });
                                setMessageMenuMessageId(null);
                              }}
                            >
                              Reply
                            </button>
                            <button
                              type="button"
                              data-no-longpress
                              className="text-brand-700 hover:underline dark:text-brand-300"
                              onClick={() => {
                                toggleStar(m.id);
                                setMessageMenuMessageId(null);
                              }}
                            >
                              {starredIds.has(m.id) ? "★" : "☆"}
                            </button>
                            <button
                              type="button"
                              data-no-longpress
                              className="text-brand-700 hover:underline dark:text-brand-300"
                              disabled={mPin.isPending}
                              onClick={() => {
                                mPin.mutate(m.id);
                                setMessageMenuMessageId(null);
                              }}
                            >
                              Pin
                            </button>
                            {room?.pinnedMessageId === m.id ? (
                              <button
                                type="button"
                                data-no-longpress
                                className="text-slate-600 hover:underline dark:text-slate-400"
                                disabled={mPin.isPending}
                                onClick={() => {
                                  mPin.mutate(null);
                                  setMessageMenuMessageId(null);
                                }}
                              >
                                Unpin
                              </button>
                            ) : null}
                            {isMe ? (
                              <>
                                <button
                                  type="button"
                                  data-no-longpress
                                  className="text-xs text-brand-700 hover:underline dark:text-brand-300"
                                  onClick={() => {
                                    setEditingId(m.id);
                                    setEditDraft(m.body || "");
                                    setMessageMenuMessageId(null);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  data-no-longpress
                                  className="text-xs text-rose-600 hover:underline"
                                  onClick={() => {
                                    if (window.confirm("Delete this message?")) {
                                      mDelete.mutate(m.id);
                                      setMessageMenuMessageId(null);
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              </>
                            ) : canModerate ? (
                              <button
                                type="button"
                                data-no-longpress
                                className="text-xs text-rose-600 hover:underline"
                                onClick={() => {
                                  if (window.confirm("Delete this message as admin?")) {
                                    mDelete.mutate(m.id);
                                    setMessageMenuMessageId(null);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {isMe ? "You" : m.senderEmail || `User #${m.senderId}`}
                      {starredIds.has(m.id) ? (
                        <span className="ml-1 text-amber-500" title="Starred (this device)">
                          ★
                        </span>
                      ) : null}
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
                        {m.replyTo ? (
                          <div className="mb-2 border-l-2 border-brand-500 pl-2 text-left text-xs text-slate-600 dark:text-slate-400">
                            <div className="font-semibold">{m.replyTo.senderEmail || "User"}</div>
                            <div className="line-clamp-3">{m.replyTo.body || "…"}</div>
                          </div>
                        ) : null}
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
                          <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                            <MessageBody text={m.body} />
                          </div>
                        ) : null}
                      </>
                    )}
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                      {m.editedAt ? <span>(edited)</span> : null}
                      {isMe && m.readStatus ? (
                        <span
                          className="text-slate-400"
                          title={`Read by ${m.readStatus.read} of ${m.readStatus.total} others`}
                        >
                          {m.readStatus.total === 0
                            ? "✓"
                            : m.readStatus.read >= m.readStatus.total
                              ? "✓✓"
                              : `✓ ${m.readStatus.read}/${m.readStatus.total}`}
                        </span>
                      ) : null}
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
                    {Array.isArray(m.reactions) && m.reactions.length ? (
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
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
        onSubmit={(e) => {
          e.preventDefault();
          const body = draft.trim();
          if (!body) return;
          if (!socketRef.current) return;
          const rid = replyTo?.id;
          socketRef.current.emit(
            "chat:sendMessage",
            { roomId: numericRoomId, body, ...(rid ? { replyToId: rid } : {}) },
            (ack) => {
              if (!ack?.ok) {
                // eslint-disable-next-line no-console
                console.warn("send failed", ack);
              }
            }
          );
          emitTyping(false);
          setDraft("");
          setReplyTo(null);
        }}
      >
        {replyTo ? (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs dark:border-slate-600 dark:bg-slate-800/50">
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 dark:text-slate-100">
                Replying to {replyTo.senderEmail || "message"}
              </div>
              <div className="mt-0.5 line-clamp-2 text-slate-600 dark:text-slate-300">{replyTo.bodySnippet}</div>
            </div>
            <button
              type="button"
              className="shrink-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
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
              const rid = replyTo?.id;
              socketRef.current.emit(
                "chat:sendMessage",
                {
                  roomId: numericRoomId,
                  body: draft.trim() || " ",
                  ...(rid ? { replyToId: rid } : {}),
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
              setReplyTo(null);
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
        </div>
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
