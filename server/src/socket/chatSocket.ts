import type http from "node:http";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { isAuthDisabled } from "../middleware/auth.js";
import type { AuthUser } from "../middleware/auth.js";
import { assertUserCanAccessChatRoom, normalizeChatBody } from "../lib/chatPermissions.js";

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

  return null; // resolved in middleware once we have a token
}

export function setupChatSocket(httpServer: http.Server): SocketIOServer {
  const allowedOrigins = getAllowedOriginsForSocket();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : true,
      credentials: true
    }
  });

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
          select: { id: true, kind: true, roomKey: true, meetingId: true, projectId: true }
        });
        if (!room) throw new Error("Room not found");

        await assertUserCanAccessChatRoom(user, room);

        await prisma.chatRoomMember.createMany({
          data: [{ roomId, userId: user.id }],
          skipDuplicates: true
        });

        socket.join(String(roomId));
        ack?.({ ok: true, roomId });
      } catch (e) {
        ack?.({ ok: false, message: e instanceof Error ? e.message : "Join failed" });
      }
    });

    socket.on("chat:sendMessage", async (payload: unknown, ack) => {
      try {
        const obj = payload as { roomId?: unknown; body?: unknown };
        const roomId = Number(obj.roomId);
        const body = normalizeChatBody(obj.body);
        if (!Number.isFinite(roomId) || roomId <= 0) throw new Error("Invalid roomId");
        if (!body) throw new Error("Message body required");

        const room = await prisma.chatRoom.findUnique({
          where: { id: roomId },
          select: { id: true, kind: true, roomKey: true, meetingId: true, projectId: true }
        });
        if (!room) throw new Error("Room not found");

        await assertUserCanAccessChatRoom(user, room);

        const message = await prisma.chatMessage.create({
          data: { roomId, senderId: user.id, body },
          include: { sender: { select: { email: true } } }
        });

        const out = {
          id: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          senderEmail: (message.sender?.email as string | undefined) ?? null,
          body: message.body,
          createdAt: message.createdAt,
          editedAt: message.editedAt ?? null
        };

        // Create in-app notifications for all other room members.
        // This ensures DM/group members see new messages in the bell/inbox.
        const recipients = await prisma.chatRoomMember.findMany({
          where: { roomId, userId: { not: user.id } },
          select: { userId: true }
        });

        if (recipients.length) {
          const senderLabel = out.senderEmail ? `from ${out.senderEmail}` : "new message";
          const title =
            room.kind === "DM"
              ? `DM ${senderLabel}`
              : room.kind === "GROUP"
                ? `New group message ${senderLabel}`
                : `New message ${senderLabel}`;

          await prisma.notification.createMany({
            data: recipients.map((r) => ({
              userId: r.userId,
              type: "CHAT_MESSAGE",
              title,
              body,
              link: `/chat/rooms/${roomId}`,
              meetingId: null
            }))
          });
        }

        io.to(String(roomId)).emit("chat:messageCreated", out);
        ack?.({ ok: true, messageId: message.id });
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
          select: { id: true, kind: true, roomKey: true, meetingId: true, projectId: true }
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

