import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { assertUserCanAccessChatRoom, getChatRoomKey, normalizeChatBody } from "../lib/chatPermissions.js";

const router = Router();

router.get("/rooms", async (req, res) => {
  const user = req.user!;

  // Creator + leader-only access.
  const meetings = await prisma.meeting.findMany({
    where: { createdById: user.id, status: { not: "CANCELLED" } },
    select: { id: true, title: true }
  });

  const leaderDirectorId = user.directorId ?? null;
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { createdById: user.id },
        ...(leaderDirectorId != null ? [{ leaderDirectorId }] : [])
      ]
    },
    select: { id: true, name: true }
  });

  const roomDefs: Array<{ kind: string; roomKey: string; title: string; meetingId?: number; projectId?: number }> = [
    ...meetings.map((m) => ({
      kind: "MEETING",
      roomKey: getChatRoomKey("MEETING", m.id),
      title: m.title,
      meetingId: m.id
    })),
    ...projects.map((p) => ({
      kind: "PROJECT",
      roomKey: getChatRoomKey("PROJECT", p.id),
      title: p.name,
      projectId: p.id
    }))
  ];

  // Upsert rooms (so we don't need to pre-create everything).
  for (const r of roomDefs) {
    await prisma.chatRoom.upsert({
      where: { roomKey: r.roomKey },
      update: { title: r.title, kind: r.kind },
      create: { roomKey: r.roomKey, kind: r.kind, title: r.title, meetingId: r.meetingId, projectId: r.projectId }
    });
  }

  const rooms = await prisma.chatRoom.findMany({
    where: { roomKey: { in: roomDefs.map((r) => r.roomKey) } },
    select: { id: true, kind: true, meetingId: true, projectId: true, title: true, createdAt: true }
  });

  // Ensure membership rows exist.
  if (rooms.length) {
    await prisma.chatRoomMember.createMany({
      data: rooms.map((r) => ({ roomId: r.id, userId: user.id })),
      skipDuplicates: true
    });
  }

  const members = await prisma.chatRoomMember.findMany({
    where: { userId: user.id, roomId: { in: rooms.map((r) => r.id) } },
    select: { roomId: true, lastReadAt: true }
  });
  const memberByRoomId = new Map(members.map((m) => [m.roomId, m.lastReadAt]));

  // v1: compute unread + last message per room (simple, acceptable for small rooms).
  const out = [];
  for (const r of rooms) {
    const lastReadAt = memberByRoomId.get(r.id) ?? null;
    const since = lastReadAt ?? new Date(0);

    const unreadCount = await prisma.chatMessage.count({
      where: {
        roomId: r.id,
        deletedAt: null,
        createdAt: { gt: since }
      }
    });

    const lastMessage = await prisma.chatMessage.findFirst({
      where: { roomId: r.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, senderId: true, body: true, createdAt: true }
    });

    out.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      meetingId: r.meetingId,
      projectId: r.projectId,
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderId: lastMessage.senderId,
            body: lastMessage.body,
            createdAt: lastMessage.createdAt
          }
        : null
    });
  }

  return res.json({ rooms: out });
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.coerce.number().int().positive().optional()
});

router.get("/rooms/:roomId/messages", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = listMessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(apiError("Invalid query", "cursor"));

  const limit = parsed.data.limit ?? 50;
  const cursor = parsed.data.cursor ?? null;

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true, kind: true, meetingId: true, projectId: true }
  });
  if (!room) return res.status(404).json(apiError("Room not found"));

  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const take = limit + 1;
  const rows = await prisma.chatMessage.findMany({
    where: { roomId, deletedAt: null },
    orderBy: { id: "asc" },
    take,
    include: { sender: { select: { email: true } } },
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1
        }
      : {})
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return res.json({
    items: page.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderEmail: (m as { sender?: { email: string } }).sender?.email ?? null,
      body: m.body,
      createdAt: m.createdAt,
      editedAt: m.editedAt ?? null
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
  });
});

// (Optional) REST for sending messages could be added later; Socket.IO handles realtime.

export default router;

