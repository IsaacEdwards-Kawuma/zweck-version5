import type http from "node:http";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { isAuthDisabled } from "../middleware/auth.js";
import type { AuthUser } from "../middleware/auth.js";
import { assertUserCanAccessChatRoom, normalizeChatBodyWithAttachment } from "../lib/chatPermissions.js";
import { getMentionableUserIds, parseMentionEmails, resolveMentionUserIds } from "../lib/chatMentions.js";
import { extractFirstHttpUrl, fetchLinkPreview } from "../lib/linkPreview.js";
let chatIoSingleton: SocketIOServer | null = null;

export function getChatIo(): SocketIOServer | null {
  return chatIoSingleton;
}

function getAllowedOriginsForSocket(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || process.env.CLIENT_ORIGIN || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function resolveSocketUser(): Promise<AuthUser | null> {
  if (isAuthDisabled()) {
    const first = await prisma.user.findFirst({ orderBy: { id: "asc" } });
    if (first) {
      return {
        id: first.id,
        email: first.email,
        role: first.role,
        directorId: first.directorId ?? null
      };
    }
    return {
      id: 1,
      email: "auth-disabled@local",
      role: "ADMIN",
      directorId: null
    };
  }

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return null;

  return null;
}

const roomSelect = {
  id: true,
  kind: true,
  roomKey: true,
  meetingId: true,
  projectId: true,
  createdById: true,
  slowModeSeconds: true,
  adminOnlyPost: true
} as const;

export function setupChatSocket(httpServer: http.Server): SocketIOServer {
  const allowedOrigins = getAllowedOriginsForSocket();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true
    }
  });
  chatIoSingleton = io;

  io.use(async (socket, next) => {
    try {
      if (isAuthDisabled()) {
        const u = await resolveSocketUser();
        if (!u) return next(new Error("Unauthorized"));
        socket.data.user = u;
        return next();
      }

      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token.trim()) return next(new Error("Unauthorized"));
      const secret = process.env.JWT_SECRET?.trim();
      if (!secret) return next(new Error("Unauthorized"));

      const payload = jwt.verify(token, secret) as AuthUser;
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, email: true, role: true, directorId: true }
      });
      if (!dbUser) return next(new Error("Unauthorized"));

      socket.data.user = {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        directorId: dbUser.directorId ?? null
      } satisfies AuthUser;

      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser;

    socket.on("chat:join", async (payload: unknown, ack) => {
      try {
        const obj = payload as { roomId?: unknown };
        const roomId = Number(obj.roomId);
        if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("Invalid roomId");

        const room = await prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: roomSelect
        });
        if (!room) throw new Error("Room not found");

        await assertUserCanAccessChatRoom(user, room);

        await prisma.chatRoomMember.createMany({
          data: [{ roomId, userId: user.id }],
          skipDuplicates: true
        });

        socket.join(String(roomId));
        ack?.({ ok: true, roomId });

        try {
          const sockets = await io.in(String(roomId)).fetchSockets();
          const userIds = [
            ...new Set(
              sockets
                .map((s) => (s.data as { user?: { id: number } }).user?.id)
                .filter((id): id is number => typeof id === "number")
            )
          ];
          io.to(String(roomId)).emit("chat:presence", {
            roomId,
            viewerCount: sockets.length,
            userIds
          });
        } catch {
          /* ignore presence broadcast errors */
        }
      } catch (e) {
        ack?.({ ok: false, message: e instanceof Error ? e.message : "Join failed" });
      }
    });

    socket.on("disconnecting", async () => {
      for (const roomIdStr of socket.rooms) {
        if (roomIdStr === socket.id) continue;
        const roomId = Number(roomIdStr);
        if (!Number.isFinite(roomId) || roomId <= 0) continue;
        try {
          const sockets = await io.in(roomIdStr).fetchSockets();
          const userIds = [
            ...new Set(
              sockets
                .map((s) => (s.data as { user?: { id: number } }).user?.id)
                .filter((id): id is number => typeof id === "number")
            )
          ];
          io.to(roomIdStr).emit("chat:presence", {
            roomId,
            viewerCount: sockets.length,
            userIds
          });
        } catch {
          /* ignore */
        }
      }
    });

    socket.on("chat:typing", async (payload: unknown, ack) => {
      try {
        const obj = payload as { roomId?: unknown; typing?: unknown };
        const roomId = Number(obj.roomId);
        const typing = Boolean(obj.typing);
        if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("Invalid roomId");

        const room = await prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: roomSelect
        });
        if (!room) throw new Error("Room not found");
        await assertUserCanAccessChatRoom(user, room);

        socket.to(String(roomId)).emit("chat:typing", {
          roomId,
          userId: user.id,
          userEmail: user.email,
          typing
        });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, message: e instanceof Error ? e.message : "Typing failed" });
      }
    });

    socket.on("chat:sendMessage", async (payload: unknown, ack) => {
      try {
        const obj = payload as {
          roomId?: unknown;
          body?: unknown;
          replyToId?: unknown;
          threadRootId?: unknown;
          attachmentUrl?: unknown;
          attachmentKind?: unknown;
          attachmentName?: unknown;
          attachmentSize?: unknown;
        };
        const roomId = Number(obj.roomId);
        const replyToIdRaw = obj.replyToId;
        const replyToId =
          replyToIdRaw === undefined || replyToIdRaw === null
            ? null
            : Number(replyToIdRaw);
        const threadRootRaw = obj.threadRootId;
        let threadRootId: number | null = null;
        if (threadRootRaw !== undefined && threadRootRaw !== null && String(threadRootRaw).trim() !== "") {
          const tr = Number(threadRootRaw);
          if (!Number.isFinite(tr) || tr <= 0) throw new Error("Invalid threadRootId");
          const root = await prisma.chatMessage.findFirst({
            where: { id: tr, roomId, deletedAt: null, threadRootId: null },
            select: { id: true }
          });
          if (!root) throw new Error("Thread root not found");
          threadRootId = tr;
        }
        const attachmentUrl =
          typeof obj.attachmentUrl === "string" && obj.attachmentUrl.trim() ? obj.attachmentUrl.trim() : null;
        const allowedKinds = new Set(["IMAGE", "FILE"]);
        const attachmentKind =
          typeof obj.attachmentKind === "string" && allowedKinds.has(obj.attachmentKind)
            ? obj.attachmentKind
            : null;
        const attachmentName =
          typeof obj.attachmentName === "string" && obj.attachmentName.trim() ? obj.attachmentName.trim().slice(0, 255) : null;
        const attachmentSize =
          typeof obj.attachmentSize === "number" && Number.isFinite(obj.attachmentSize) ? Math.floor(obj.attachmentSize) : null;

        const hasAttachment = Boolean(attachmentUrl && attachmentKind);
        const body = normalizeChatBodyWithAttachment(obj.body, hasAttachment);
        if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("Invalid roomId");
        if (!body && !hasAttachment) throw new Error("Message body or attachment required");

        const room = await prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: roomSelect
        });
        if (!room) throw new Error("Room not found");

        await assertUserCanAccessChatRoom(user, room);

        if (room.kind === "GROUP" && room.adminOnlyPost) {
          if (user.role !== "ADMIN" && user.id !== room.createdById) {
            throw new Error("Only admins can post in this room");
          }
        }

        const slow = room.slowModeSeconds ?? null;
        if (slow != null && slow > 0) {
          const lastOwn = await prisma.chatMessage.findFirst({
            where: { roomId, senderId: user.id, deletedAt: null },
            orderBy: { id: "desc" },
            select: { createdAt: true }
          });
          if (lastOwn) {
            const waitMs = slow * 1000 - (Date.now() - new Date(lastOwn.createdAt).getTime());
            if (waitMs > 0) {
              throw new Error(`Slow mode: wait ${Math.ceil(waitMs / 1000)}s`);
            }
          }
        }

        if (replyToId != null) {
          if (!Number.isFinite(replyToId) || replyToId <= 0) throw new Error("Invalid replyToId");
          const parent = await prisma.chatMessage.findFirst({
            where: { id: replyToId, roomId, deletedAt: null },
            select: { id: true }
          });
          if (!parent) throw new Error("Reply target not found");
        }

        const mentionEmails = parseMentionEmails(body ?? "");
        const mentionable = await getMentionableUserIds(roomId, room.kind);
        const mentionedUserIds = await resolveMentionUserIds(mentionEmails, mentionable);

        const message = await prisma.chatMessage.create({
          data: {
            roomId,
            senderId: user.id,
            body: body ?? "",
            replyToId: replyToId ?? undefined,
            threadRootId: threadRootId ?? undefined,
            attachmentUrl,
            attachmentKind,
            attachmentName,
            attachmentSize,
            mentionedUserIds
          },
          include: {
            sender: { select: { email: true } },
            replyTo: {
              select: {
                id: true,
                body: true,
                deletedAt: true,
                sender: { select: { email: true } }
              }
            }
          }
        });

        const replySnap =
          message.replyTo && !message.replyTo.deletedAt
            ? {
                id: message.replyTo.id,
                body: (message.replyTo.body ?? "").slice(0, 500),
                senderEmail: message.replyTo.sender?.email ?? null
              }
            : replyToId
              ? { id: replyToId, body: "", senderEmail: null as string | null }
              : null;

        const out = {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          senderEmail: (message.sender?.email as string | undefined) ?? null,
          body: message.body,
          createdAt: message.createdAt,
          editedAt: message.editedAt ?? null,
          deletedAt: message.deletedAt ?? null,
          attachmentUrl: message.attachmentUrl ?? null,
          attachmentKind: message.attachmentKind ?? null,
          attachmentName: message.attachmentName ?? null,
          attachmentSize: message.attachmentSize ?? null,
          replyToId: message.replyToId ?? null,
          replyTo: replySnap,
          threadRootId: message.threadRootId ?? null,
          forwardedFromId: null as number | null,
          mentionedUserIds: message.mentionedUserIds ?? [],
          linkPreview: null as unknown,
          reactions: [] as Array<{ emoji: string; userId: number; userEmail: string | null }>
        };

        const recipients =
          room.kind === "MEETING" || room.kind === "PROJECT"
            ? await prisma.user.findMany({
                where: { id: { not: user.id } },
                select: { id: true }
              })
            : await prisma.chatRoomMember.findMany({
                where: { roomId, userId: { not: user.id } },
                select: { userId: true }
              });

        const recipientUserIds = recipients
          .map((r: { id?: number; userId?: number }) => (r.id != null ? r.id : r.userId))
          .filter((id: number | undefined): id is number => id != null);

        if (recipientUserIds.length) {
          const prefs = await prisma.user.findMany({
            where: { id: { in: recipientUserIds } },
            select: { id: true, inAppChatMessages: true, inAppChatMentionsOnly: true }
          });
          const allowedInApp = new Set(prefs.filter((p) => p.inAppChatMessages).map((p) => p.id));
          const globalChatMentionsOnly = new Set(
            prefs.filter((p) => p.inAppChatMentionsOnly).map((p) => p.id)
          );

          const memberPrefs = await prisma.chatRoomMember.findMany({
            where: { roomId, userId: { in: recipientUserIds } },
            select: { userId: true, notifyPreference: true, mutedUntil: true }
          });
          const prefMap = new Map(memberPrefs.map((m) => [m.userId, m]));

          const shouldNotify = (uid: number): boolean => {
            if (globalChatMentionsOnly.has(uid) && !mentionedUserIds.includes(uid)) return false;
            const row = prefMap.get(uid);
            if (row?.mutedUntil && new Date(row.mutedUntil) > new Date()) return false;
            const np = row?.notifyPreference ?? "ALL";
            if (np === "NONE") return false;
            if (np === "MENTIONS") return mentionedUserIds.includes(uid);
            return true;
          };

          const senderLabel = out.senderEmail ? `from ${out.senderEmail}` : "new message";
          const preview = body?.slice(0, 200) || (hasAttachment ? "[attachment]" : "");
          const title =
            room.kind === "DM"
              ? `DM ${senderLabel}`
              : room.kind === "GROUP"
                ? `New group message ${senderLabel}`
                : `New message ${senderLabel}`;

          const toNotify = recipientUserIds.filter((id) => allowedInApp.has(id) && shouldNotify(id));
          if (toNotify.length) {
            await prisma.notification.createMany({
              data: toNotify.map((uid) => ({
                userId: uid,
                type: "CHAT_MESSAGE",
                title,
                body: preview || null,
                link: `/chat/rooms/${roomId}`,
                meetingId: null
              }))
            });
          }
        }

        io.to(String(roomId)).emit("chat:messageCreated", out);
        ack?.({ ok: true, messageId: message.id });

        const url = extractFirstHttpUrl(body ?? "");
        if (url) {
          void (async () => {
            const preview = await fetchLinkPreview(url);
            if (!preview) return;
            await prisma.chatMessage.update({
              where: { id: message.id },
              data: { linkPreview: preview as object }
            });
            io.to(String(roomId)).emit("chat:messageUpdated", {
              id: message.id,
              roomId,
              linkPreview: preview
            });
          })();
        }
      } catch (e) {
        ack?.({ ok: false, message: e instanceof Error ? e.message : "Send failed" });
      }
    });

    socket.on("chat:markRead", async (payload: unknown, ack) => {
      try {
        const obj = payload as { roomId?: unknown; lastMessageId?: unknown };
        const roomId = Number(obj.roomId);
        const lastMessageId = Number(obj.lastMessageId);
        if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("Invalid roomId");
        if (!Number.isFinite(lastMessageId) || lastMessageId <= 0) throw new Error("Invalid lastMessageId");

        const room = await prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: roomSelect
        });
        if (!room) throw new Error("Room not found");
        await assertUserCanAccessChatRoom(user, room);

        const message = await prisma.chatMessage.findFirst({
          where: { id: lastMessageId, roomId, deletedAt: null },
          select: { id: true, createdAt: true }
        });
        if (!message) throw new Error("Message not found");

        await prisma.chatRoomMember.createMany({
          data: [{ roomId, userId: user.id, lastReadAt: message.createdAt }],
          skipDuplicates: true
        });
        await prisma.chatRoomMember.updateMany({
          where: { roomId, userId: user.id },
          data: { lastReadAt: message.createdAt }
        });

        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, message: e instanceof Error ? e.message : "MarkRead failed" });
      }
    });
  });

  return io;
}
