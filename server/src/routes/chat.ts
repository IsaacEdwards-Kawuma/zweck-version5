import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { assertUserCanAccessChatRoom, getChatRoomKey, normalizeChatBody } from "../lib/chatPermissions.js";

const router = Router();

router.get("/rooms", async (req, res) => {
  const user = req.user!;

  // 1) Public rooms: everyone can access Meeting + Project discussions.
  const meetings = await prisma.meeting.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { id: true, title: true }
  });

  const projects = await prisma.project.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { id: true, name: true }
  });

  const publicRoomDefs: Array<{
    kind: string;
    roomKey: string;
    title: string;
    meetingId?: number;
    projectId?: number;
  }> = [
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

  for (const r of publicRoomDefs) {
    await prisma.chatRoom.upsert({
      where: { roomKey: r.roomKey },
      update: { title: r.title, kind: r.kind },
      create: { roomKey: r.roomKey, kind: r.kind, title: r.title, meetingId: r.meetingId, projectId: r.projectId }
    });
  }

  const publicRooms = publicRoomDefs.length
    ? await prisma.chatRoom.findMany({
        where: { roomKey: { in: publicRoomDefs.map((r) => r.roomKey) } },
        select: { id: true, kind: true, roomKey: true, meetingId: true, projectId: true, title: true, createdAt: true }
      })
    : [];

  // 2) Private rooms: DM + GROUP rooms come from memberships.
  const membershipRooms = await prisma.chatRoomMember.findMany({
    where: { userId: user.id },
    select: {
      roomId: true,
      lastReadAt: true,
      room: {
        select: { id: true, kind: true, roomKey: true, meetingId: true, projectId: true, title: true, createdAt: true }
      }
    }
  });

  const roomById = new Map<number, typeof publicRooms[number]>();
  for (const r of publicRooms) roomById.set(r.id, r);
  for (const mr of membershipRooms) {
    if (!mr.room) continue;
    roomById.set(mr.room.id, mr.room);
  }

  const rooms = [...roomById.values()];

  // Read cursors for rooms we return.
  const roomIds = rooms.map((r) => r.id);
  const memberRows = await prisma.chatRoomMember.findMany({
    where: { userId: user.id, roomId: { in: roomIds } },
    select: { roomId: true, lastReadAt: true }
  });
  const memberByRoomId = new Map(memberRows.map((m) => [m.roomId, m.lastReadAt]));

  // v1: compute unread + last message per room.
  const out = [];
  for (const r of rooms) {
    const lastReadAt = memberByRoomId.get(r.id) ?? null;
    const unreadSince = lastReadAt ?? null;

    const unreadCount = unreadSince
      ? await prisma.chatMessage.count({
          where: { roomId: r.id, deletedAt: null, createdAt: { gt: unreadSince } }
        })
      : 0;

    const lastMessage = await prisma.chatMessage.findFirst({
      where: { roomId: r.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, senderId: true, body: true, createdAt: true }
    });

    out.push({
      id: r.id,
      kind: r.kind,
      roomKey: r.roomKey,
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

router.post("/rooms/dm", async (req, res) => {
  const user = req.user!;
  const bodySchema = z.object({ otherEmail: z.string().email().max(320) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "otherEmail"));

  const otherEmail = parsed.data.otherEmail.trim().toLowerCase();
  const other = await prisma.user.findUnique({
    where: { email: otherEmail },
    select: { id: true, email: true }
  });
  if (!other) return res.status(404).json(apiError("User not found"));
  if (other.id === user.id) return res.status(400).json(apiError("Cannot DM yourself"));

  const a = Math.min(user.id, other.id);
  const b = Math.max(user.id, other.id);
  const roomKey = `DM:${a}:${b}`;
  const title = `DM: ${other.email}`;

  const room = await prisma.chatRoom.upsert({
    where: { roomKey },
    update: { kind: "DM", title },
    create: { roomKey, kind: "DM", title }
  });

  await prisma.chatRoomMember.createMany({
    data: [
      { roomId: room.id, userId: user.id },
      { roomId: room.id, userId: other.id }
    ],
    skipDuplicates: true
  });

  res.json({ roomId: room.id });
});

router.post("/rooms/group", async (req, res) => {
  const user = req.user!;
  const bodySchema = z.object({
    title: z.string().min(1).max(200),
    memberEmails: z.array(z.string().email().max(320)).optional()
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "group"));

  const title = parsed.data.title.trim();
  const memberEmails = Array.isArray(parsed.data.memberEmails) ? parsed.data.memberEmails : [];

  const normalized = memberEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(normalized)];

  const members = await prisma.user.findMany({
    where: { email: { in: unique } },
    select: { id: true, email: true }
  });

  if (members.length !== unique.length) {
    return res.status(400).json(apiError("One or more member emails not found"));
  }

  const memberIds = new Set<number>(members.map((m) => m.id));
  memberIds.add(user.id);

  const roomKey = `GROUP:${crypto.randomUUID()}`;
  const room = await prisma.chatRoom.create({
    data: { roomKey, kind: "GROUP", title }
  });

  await prisma.chatRoomMember.createMany({
    data: [...memberIds].map((uid) => ({ roomId: room.id, userId: uid })),
    skipDuplicates: true
  });

  res.json({ roomId: room.id });
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
    select: { id: true, kind: true, roomKey: true, meetingId: true, projectId: true }
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

