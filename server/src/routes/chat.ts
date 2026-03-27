import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import {
  assertUserCanAccessChatRoom,
  assertUserCanDeleteMessage,
  assertUserCanManageGroupMembers,
  assertUserOwnsMessage,
  assertDmNotBlocked,
  getChatRoomKey,
  getOtherDmUserId,
  normalizeChatBody,
  normalizeChatBodyWithAttachment
} from "../lib/chatPermissions.js";
import { getMentionableUserIds, parseMentionEmails, resolveMentionUserIds } from "../lib/chatMentions.js";
import { getChatIo } from "../socket/chatSocket.js";
import { isE2eeAttachmentKind, isE2eeEncryptedBody } from "../lib/chatE2ee.js";

const router = Router();

const roomSelectAuth = {
  id: true,
  kind: true,
  roomKey: true,
  meetingId: true,
  projectId: true,
  createdById: true,
  slowModeSeconds: true,
  adminOnlyPost: true
} as const;

const uploadRoot = path.join(process.cwd(), "uploads", "chat");
fs.mkdirSync(uploadRoot, { recursive: true });

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, true);
  }
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function isImageMime(m: string): boolean {
  return /^image\/(jpeg|jpg|png|gif|webp|pjpeg|x-png)$/i.test(m);
}

const emojiSchema = z.string().trim().min(1).max(32);

async function loadReactionsMap(messageIds: number[]) {
  const map = new Map<number, Array<{ emoji: string; userId: number; userEmail: string | null }>>();
  if (!messageIds.length) return map;
  const rows = await prisma.chatMessageReaction.findMany({
    where: { messageId: { in: messageIds } },
    include: { user: { select: { email: true } } },
    orderBy: [{ messageId: "asc" }, { id: "asc" }]
  });
  for (const r of rows) {
    const arr = map.get(r.messageId) ?? [];
    arr.push({
      emoji: r.emoji,
      userId: r.userId,
      userEmail: r.user.email
    });
    map.set(r.messageId, arr);
  }
  return map;
}

function mapMessageRow(
  m: {
    id: number;
    roomId: number;
    senderId: number;
    body: string;
    createdAt: Date;
    editedAt: Date | null;
    deletedAt: Date | null;
    attachmentUrl: string | null;
    attachmentKind: string | null;
    attachmentName: string | null;
    attachmentSize: number | null;
    replyToId?: number | null;
    threadRootId?: number | null;
    forwardedFromId?: number | null;
    mentionedUserIds?: number[];
    linkPreview?: unknown;
    sender?: { email: string } | null;
    replyTo?: {
      id: number;
      body: string;
      deletedAt: Date | null;
      sender?: { email: string } | null;
    } | null;
  },
  reactions: Array<{ emoji: string; userId: number; userEmail: string | null }>,
  extras?: {
    readStatus?: { read: number; total: number } | null;
    threadReplyCount?: number;
  }
) {
  const replySnap =
    m.replyTo && !m.replyTo.deletedAt
      ? {
          id: m.replyTo.id,
          body: m.replyTo.body?.slice(0, 500) ?? "",
          senderEmail: m.replyTo.sender?.email ?? null
        }
      : m.replyToId
        ? { id: m.replyToId, body: "", senderEmail: null as string | null }
        : null;

  return {
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId,
    senderEmail: m.sender?.email ?? null,
    body: m.deletedAt ? "" : m.body,
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null,
    attachmentUrl: m.attachmentUrl ?? null,
    attachmentKind: m.attachmentKind ?? null,
    attachmentName: m.attachmentName ?? null,
    attachmentSize: m.attachmentSize ?? null,
    replyToId: m.replyToId ?? null,
    replyTo: replySnap,
    threadRootId: m.threadRootId ?? null,
    forwardedFromId: m.forwardedFromId ?? null,
    mentionedUserIds: Array.isArray(m.mentionedUserIds) ? m.mentionedUserIds : [],
    linkPreview: m.linkPreview ?? null,
    reactions,
    ...(extras?.readStatus != null ? { readStatus: extras.readStatus } : {}),
    ...(extras?.threadReplyCount != null ? { threadReplyCount: extras.threadReplyCount } : {})
  };
}

function attachReadStatusForSender(
  userId: number,
  members: Array<{ userId: number; lastReadAt: Date | null }>,
  msg: { senderId: number; createdAt: Date }
): { read: number; total: number } | null {
  if (msg.senderId !== userId) return null;
  const others = members.filter((m) => m.userId !== userId);
  if (!others.length) return { read: 0, total: 0 };
  const t = new Date(msg.createdAt).getTime();
  const read = others.filter((m) => m.lastReadAt && new Date(m.lastReadAt).getTime() >= t).length;
  return { read, total: others.length };
}

const messageInclude = {
  sender: { select: { email: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      sender: { select: { email: true } }
    }
  }
} as const;

function emitRoom(roomId: number, event: string, payload: unknown) {
  const io = getChatIo();
  io?.to(String(roomId)).emit(event, payload);
}

async function getMemberClearedBeforeAt(userId: number, roomId: number): Promise<Date | null> {
  const m = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { clearedBeforeAt: true }
  });
  return m?.clearedBeforeAt ?? null;
}

const chatPublicKeyJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1).max(200),
  y: z.string().min(1).max(200),
  ext: z.boolean().optional(),
  key_ops: z.array(z.string()).optional()
});

router.get("/me/crypto", async (req, res) => {
  const user = req.user!;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { chatPublicKeyJwk: true }
  });
  const raw = row?.chatPublicKeyJwk?.trim();
  if (!raw) return res.json({ publicKeyJwk: null });
  try {
    const parsed = JSON.parse(raw) as unknown;
    return res.json({ publicKeyJwk: parsed });
  } catch {
    return res.json({ publicKeyJwk: null });
  }
});

router.put("/me/crypto", async (req, res) => {
  const user = req.user!;
  const parsed = z.object({ publicKeyJwk: chatPublicKeyJwkSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid public key", "body"));
  await prisma.user.update({
    where: { id: user.id },
    data: { chatPublicKeyJwk: JSON.stringify(parsed.data.publicKeyJwk) }
  });
  res.json({ ok: true });
});

router.get("/users/:userId/public-key", async (req, res) => {
  const user = req.user!;
  const targetId = Number(req.params.userId);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json(apiError("Invalid user id"));

  if (targetId === user.id) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { chatPublicKeyJwk: true }
    });
    const raw = row?.chatPublicKeyJwk?.trim();
    if (!raw) return res.json({ publicKeyJwk: null });
    try {
      return res.json({ publicKeyJwk: JSON.parse(raw) as unknown });
    } catch {
      return res.json({ publicKeyJwk: null });
    }
  }

  const a = Math.min(user.id, targetId);
  const b = Math.max(user.id, targetId);
  const roomKey = `DM:${a}:${b}`;
  const dmRoom = await prisma.chatRoom.findUnique({ where: { roomKey }, select: { id: true } });
  if (!dmRoom) return res.status(403).json(apiError("Forbidden", "user"));

  const row = await prisma.user.findUnique({
    where: { id: targetId },
    select: { chatPublicKeyJwk: true }
  });
  const raw = row?.chatPublicKeyJwk?.trim();
  if (!raw) return res.json({ publicKeyJwk: null });
  try {
    return res.json({ publicKeyJwk: JSON.parse(raw) as unknown });
  } catch {
    return res.json({ publicKeyJwk: null });
  }
});

router.get("/rooms", async (req, res) => {
  const user = req.user!;
  const includeArchived =
    req.query.includeArchived === "1" || String(req.query.includeArchived).toLowerCase() === "true";

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

  if (publicRooms.length) {
    await prisma.chatRoomMember.createMany({
      data: publicRooms.map((r) => ({ roomId: r.id, userId: user.id })),
      skipDuplicates: true
    });
  }

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

  const roomById = new Map<number, (typeof publicRooms)[number]>();
  for (const r of publicRooms) roomById.set(r.id, r);
  for (const mr of membershipRooms) {
    if (!mr.room) continue;
    roomById.set(mr.room.id, mr.room);
  }

  const rooms = [...roomById.values()];
  const roomIds = rooms.map((r) => r.id);
  const memberRows = await prisma.chatRoomMember.findMany({
    where: { userId: user.id, roomId: { in: roomIds } },
    select: { roomId: true, lastReadAt: true, createdAt: true, archivedAt: true, clearedBeforeAt: true }
  });
  const memberByRoomId = new Map(
    memberRows.map((m) => [
      m.roomId,
      { lastReadAt: m.lastReadAt, createdAt: m.createdAt, archivedAt: m.archivedAt, clearedBeforeAt: m.clearedBeforeAt }
    ])
  );

  const blockRows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    select: { blockerId: true, blockedId: true }
  });
  const blockedPeerIds = new Set<number>();
  for (const b of blockRows) {
    blockedPeerIds.add(b.blockerId === user.id ? b.blockedId : b.blockerId);
  }

  const out = [];
  for (const r of rooms) {
    const member = memberByRoomId.get(r.id) ?? null;
    const archived = Boolean(member?.archivedAt);
    if (includeArchived) {
      if (!archived) continue;
    } else {
      if (archived) continue;
    }

    if (r.kind === "DM") {
      const other = getOtherDmUserId(r.roomKey, user.id);
      if (other != null && blockedPeerIds.has(other)) continue;
    }

    const cleared = member?.clearedBeforeAt ?? null;
    const lastRead = member?.lastReadAt ?? member?.createdAt ?? new Date(0);
    const effectiveUnreadSince = new Date(
      Math.max(lastRead.getTime(), cleared ? cleared.getTime() : 0)
    );

    const unreadCount = await prisma.chatMessage.count({
      where: {
        roomId: r.id,
        deletedAt: null,
        createdAt: { gt: effectiveUnreadSince }
      }
    });

    const lastMessage = await prisma.chatMessage.findFirst({
      where: {
        roomId: r.id,
        deletedAt: null,
        ...(cleared ? { createdAt: { gt: cleared } } : {})
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        senderId: true,
        body: true,
        attachmentKind: true,
        createdAt: true,
        sender: { select: { email: true } }
      }
    });

    out.push({
      id: r.id,
      kind: r.kind,
      roomKey: r.roomKey,
      title: r.title,
      meetingId: r.meetingId,
      projectId: r.projectId,
      archived,
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderId: lastMessage.senderId,
            senderEmail: lastMessage.sender?.email ?? null,
            body: lastMessage.body,
            attachmentKind: lastMessage.attachmentKind ?? null,
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

  try {
    await assertDmNotBlocked(user.id, {
      id: room.id,
      kind: "DM",
      roomKey: room.roomKey,
      meetingId: room.meetingId,
      projectId: room.projectId,
      createdById: room.createdById
    });
  } catch (e) {
    return res.status(403).json(e);
  }

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
    data: { roomKey, kind: "GROUP", title, createdById: user.id }
  });

  await prisma.chatRoomMember.createMany({
    data: [...memberIds].map((uid) => ({ roomId: room.id, userId: uid })),
    skipDuplicates: true
  });

  res.json({ roomId: room.id });
});

router.post("/rooms/read-all", async (req, res) => {
  const user = req.user!;
  const result = await prisma.chatRoomMember.updateMany({
    where: { userId: user.id },
    data: { lastReadAt: new Date() }
  });
  res.json({ updated: result.count });
});

const blockBodySchema = z.object({ userId: z.number().int().positive() });

router.get("/blocks", async (req, res) => {
  const user = req.user!;
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: user.id },
    select: {
      blockedId: true,
      blocked: { select: { email: true } }
    },
    orderBy: { id: "desc" }
  });
  res.json({
    blocks: rows.map((r) => ({ userId: r.blockedId, email: r.blocked.email }))
  });
});

router.post("/blocks", async (req, res) => {
  const user = req.user!;
  const parsed = blockBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "userId"));
  const targetId = parsed.data.userId;
  if (targetId === user.id) return res.status(400).json(apiError("Cannot block yourself"));
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetId } },
    create: { blockerId: user.id, blockedId: targetId },
    update: {}
  });
  res.json({ ok: true });
});

router.delete("/blocks/:userId", async (req, res) => {
  const user = req.user!;
  const targetId = Number(req.params.userId);
  if (!Number.isFinite(targetId) || targetId <= 0) return res.status(400).json(apiError("Invalid user id"));
  await prisma.userBlock.deleteMany({
    where: { blockerId: user.id, blockedId: targetId }
  });
  res.json({ ok: true });
});

router.post("/rooms/:roomId/archive", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }
  const member = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } }
  });
  if (!member) return res.status(404).json(apiError("Not a member"));
  await prisma.chatRoomMember.update({
    where: { id: member.id },
    data: { archivedAt: new Date() }
  });
  res.json({ ok: true });
});

router.post("/rooms/:roomId/unarchive", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }
  const member = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } }
  });
  if (!member) return res.status(404).json(apiError("Not a member"));
  await prisma.chatRoomMember.update({
    where: { id: member.id },
    data: { archivedAt: null }
  });
  res.json({ ok: true });
});

router.post("/rooms/:roomId/clear", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }
  const member = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } }
  });
  if (!member) return res.status(404).json(apiError("Not a member"));
  const now = new Date();
  await prisma.chatRoomMember.update({
    where: { id: member.id },
    data: { clearedBeforeAt: now, lastReadAt: now }
  });
  res.json({ ok: true });
});

router.delete("/rooms/:roomId/membership", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }
  if (room.kind === "MEETING" || room.kind === "PROJECT") {
    return res.status(400).json(apiError("Archive this room instead of leaving", "leave"));
  }
  await prisma.chatRoomMember.deleteMany({ where: { roomId, userId: user.id } });
  res.json({ ok: true });
});

router.get("/users", async (req, res) => {
  const user = req.user!;
  const users = await prisma.user.findMany({
    where: { id: { not: user.id } },
    select: {
      id: true,
      email: true,
      role: true,
      directorId: true,
      director: { select: { name: true, initials: true, avatarUrl: true } }
    },
    orderBy: { createdAt: "asc" }
  });
  res.json({ users });
});

router.get("/rooms/:roomId/summary", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      kind: true,
      title: true,
      roomKey: true,
      meetingId: true,
      projectId: true,
      createdById: true,
      slowModeSeconds: true,
      adminOnlyPost: true,
      pinnedMessageId: true,
      pinnedMessage: {
        select: {
          id: true,
          body: true,
          sender: { select: { email: true } }
        }
      }
    }
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
    select: { archivedAt: true, clearedBeforeAt: true, mutedUntil: true, notifyPreference: true }
  });

  const otherUserId = room.kind === "DM" ? getOtherDmUserId(room.roomKey, user.id) : null;

  let dmPeerHasPublicKey = false;
  if (otherUserId != null) {
    const peer = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { chatPublicKeyJwk: true }
    });
    dmPeerHasPublicKey = Boolean(peer?.chatPublicKeyJwk?.trim());
  }

  return res.json({
    room: {
      ...room,
      membership: membership ?? { archivedAt: null, clearedBeforeAt: null },
      otherUserId,
      dmPeerHasPublicKey
    }
  });
});

const pinBodySchema = z.object({
  messageId: z.number().int().positive().nullable()
});

router.patch("/rooms/:roomId/pin", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = pinBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "messageId"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const mid = parsed.data.messageId;
  if (mid === null) {
    await prisma.chatRoom.update({ where: { id: roomId }, data: { pinnedMessageId: null } });
    emitRoom(roomId, "chat:roomUpdated", { roomId, pinnedMessageId: null });
    return res.json({ ok: true, pinnedMessageId: null });
  }

  const msg = await prisma.chatMessage.findFirst({
    where: { id: mid, roomId, deletedAt: null }
  });
  if (!msg) return res.status(404).json(apiError("Message not found"));

  await prisma.chatRoom.update({
    where: { id: roomId },
    data: { pinnedMessageId: mid }
  });
  emitRoom(roomId, "chat:roomUpdated", { roomId, pinnedMessageId: mid });
  return res.json({ ok: true, pinnedMessageId: mid });
});

router.get("/rooms/:roomId/presence", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const io = getChatIo();
  if (!io) {
    return res.json({ viewerCount: 0, userIds: [] as number[] });
  }
  try {
    const sockets = await io.in(String(roomId)).fetchSockets();
    const userIds = [
      ...new Set(
        sockets.map((s) => (s.data as { user?: { id: number } }).user?.id).filter((id): id is number => typeof id === "number")
      )
    ];
    return res.json({ viewerCount: sockets.length, userIds });
  } catch {
    return res.json({ viewerCount: 0, userIds: [] as number[] });
  }
});

router.get("/rooms/:roomId/members", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const members = await prisma.chatRoomMember.findMany({
    where: { roomId },
    select: {
      userId: true,
      lastReadAt: true,
      user: { select: { email: true } }
    },
    orderBy: { userId: "asc" }
  });

  return res.json({
    members: members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      lastReadAt: m.lastReadAt
    })),
    createdById: room.createdById
  });
});

const addMemberSchema = z.object({
  email: z.string().email().max(320)
});

router.post("/rooms/:roomId/members", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "email"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanManageGroupMembers(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const other = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });
  if (!other) return res.status(404).json(apiError("User not found"));

  await prisma.chatRoomMember.createMany({
    data: [{ roomId, userId: other.id }],
    skipDuplicates: true
  });

  return res.json({ ok: true, userId: other.id });
});

router.delete("/rooms/:roomId/members/:userId", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) return res.status(400).json(apiError("Invalid user id"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanManageGroupMembers(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  if (targetUserId === room.createdById) {
    return res.status(400).json(apiError("Cannot remove group creator"));
  }

  await prisma.chatRoomMember.deleteMany({
    where: { roomId, userId: targetUserId }
  });

  return res.json({ ok: true });
});

router.get("/rooms/:roomId/read-receipts", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  const messageId = Number(req.query.messageId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  if (!Number.isFinite(messageId) || messageId <= 0) return res.status(400).json(apiError("Invalid messageId"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const msg = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId, deletedAt: null },
    select: { id: true, createdAt: true }
  });
  if (!msg) return res.status(404).json(apiError("Message not found"));

  const members = await prisma.chatRoomMember.findMany({
    where: {
      roomId,
      lastReadAt: { gte: msg.createdAt }
    },
    select: {
      userId: true,
      user: { select: { email: true } }
    }
  });

  return res.json({
    messageId: msg.id,
    readers: members.map((m) => ({ userId: m.userId, email: m.user.email }))
  });
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.coerce.number().int().positive().optional()
});

router.get("/rooms/:roomId/messages/search", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(apiError("Invalid query", "q"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const limit = parsed.data.limit ?? 30;
  const cursor = parsed.data.cursor ?? null;
  const q = parsed.data.q.trim();

  const clearedBefore = await getMemberClearedBeforeAt(user.id, roomId);

  const rowsDesc = await prisma.chatMessage.findMany({
    where: {
      roomId,
      deletedAt: null,
      body: { contains: q, mode: "insensitive" },
      ...(clearedBefore ? { createdAt: { gt: clearedBefore } } : {})
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: messageInclude,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });

  const hasMore = rowsDesc.length > limit;
  const trimmed = hasMore ? rowsDesc.slice(0, limit) : rowsDesc;
  const itemsAsc = trimmed.slice().reverse();
  const ids = itemsAsc.map((m) => m.id);
  const reactMap = await loadReactionsMap(ids);

  const members = await prisma.chatRoomMember.findMany({
    where: { roomId },
    select: { userId: true, lastReadAt: true }
  });

  return res.json({
    items: itemsAsc.map((m) => {
      const reactions = reactMap.get(m.id) ?? [];
      const rs = attachReadStatusForSender(user.id, members, m);
      return mapMessageRow(
        { ...m, sender: m.sender, replyTo: m.replyTo },
        reactions,
        rs == null ? undefined : { readStatus: rs }
      );
    }),
    nextCursor: hasMore ? itemsAsc[0]?.id ?? null : null
  });
});

router.post(
  "/rooms/:roomId/attachments",
  (req, res, next) => {
    const roomId = Number(req.params.roomId);
    if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
    chatUpload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json(apiError("File must be 10MB or smaller", "file"));
        }
        return res.status(400).json(apiError(err.message, "file"));
      }
      if (err) return res.status(400).json(apiError("Upload failed", "file"));
      next();
    });
  },
  async (req, res) => {
    const user = req.user!;
    const roomId = Number(req.params.roomId);
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: roomSelectAuth
    });
    if (!room) return res.status(404).json(apiError("Room not found"));
    try {
      await assertUserCanAccessChatRoom(user, room);
    } catch (e) {
      return res.status(403).json(e);
    }

    if (!req.file?.buffer) return res.status(400).json(apiError("File required", "file"));

    const mime = (req.file.mimetype || "").toLowerCase();
    const kind = isImageMime(mime) ? "IMAGE" : "FILE";
    const orig = sanitizeFilename(req.file.originalname || "file");
    const fname = `${crypto.randomUUID()}-${orig}`;
    const full = path.join(uploadRoot, fname);
    await fs.promises.writeFile(full, req.file.buffer);

    const publicUrl = `/api/uploads/chat/${fname}`;
    return res.json({
      attachmentUrl: publicUrl,
      attachmentKind: kind,
      attachmentName: req.file.originalname?.slice(0, 255) || orig,
      attachmentSize: req.file.size
    });
  }
);

router.patch("/rooms/:roomId/messages/:messageId", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  if (!Number.isFinite(messageId) || messageId <= 0) return res.status(400).json(apiError("Invalid message id"));

  const bodySchema = z.object({ body: z.string().max(20000) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "body"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const msg = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId }
  });
  if (!msg) return res.status(404).json(apiError("Message not found"));
  if (msg.deletedAt) return res.status(400).json(apiError("Message deleted"));
  try {
    assertUserOwnsMessage(user, msg.senderId);
  } catch (e) {
    return res.status(403).json(e);
  }

  const newBody = normalizeChatBody(parsed.data.body);
  if (!newBody) return res.status(400).json(apiError("Body required", "body"));

  const mentionEmails = isE2eeEncryptedBody(newBody) ? [] : parseMentionEmails(newBody);
  const mentionable = await getMentionableUserIds(roomId, room.kind);
  const mentionedUserIds = await resolveMentionUserIds(mentionEmails, mentionable);

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body: newBody, editedAt: new Date(), mentionedUserIds },
    include: messageInclude
  });

  const reactMap = await loadReactionsMap([messageId]);
  const reactions = reactMap.get(messageId) ?? [];
  const members = await prisma.chatRoomMember.findMany({
    where: { roomId },
    select: { userId: true, lastReadAt: true }
  });
  const rs = attachReadStatusForSender(user.id, members, updated);
  const out = mapMessageRow(
    { ...updated, sender: updated.sender, replyTo: updated.replyTo },
    reactions,
    rs == null ? undefined : { readStatus: rs }
  );
  emitRoom(roomId, "chat:messageUpdated", out);

  return res.json(out);
});

router.delete("/rooms/:roomId/messages/:messageId", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  if (!Number.isFinite(messageId) || messageId <= 0) return res.status(400).json(apiError("Invalid message id"));

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const msg = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId }
  });
  if (!msg) return res.status(404).json(apiError("Message not found"));
  if (msg.deletedAt) return res.status(400).json(apiError("Already deleted"));
  try {
    assertUserCanDeleteMessage(user, msg.senderId);
  } catch (e) {
    return res.status(403).json(e);
  }

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), body: "" }
  });

  await prisma.chatRoom.updateMany({
    where: { id: roomId, pinnedMessageId: messageId },
    data: { pinnedMessageId: null }
  });

  emitRoom(roomId, "chat:messageDeleted", { id: messageId, roomId });
  return res.json({ ok: true, id: messageId });
});

const reactionBodySchema = z.object({
  emoji: z.string().min(1).max(32)
});

router.post("/rooms/:roomId/messages/:messageId/reactions", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  if (!Number.isFinite(messageId) || messageId <= 0) return res.status(400).json(apiError("Invalid message id"));

  const parsed = reactionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "emoji"));
  const emojiParsed = emojiSchema.safeParse(parsed.data.emoji);
  if (!emojiParsed.success) return res.status(400).json(apiError("Invalid emoji", "emoji"));
  const emoji = emojiParsed.data;

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const msg = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId, deletedAt: null }
  });
  if (!msg) return res.status(404).json(apiError("Message not found"));

  const existing = await prisma.chatMessageReaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId: user.id, emoji }
    }
  });

  if (existing) {
    await prisma.chatMessageReaction.delete({
      where: { id: existing.id }
    });
  } else {
    await prisma.chatMessageReaction.create({
      data: { messageId, userId: user.id, emoji }
    });
  }

  const reactMap = await loadReactionsMap([messageId]);
  const reactions = reactMap.get(messageId) ?? [];
  emitRoom(roomId, "chat:messageReactionsUpdated", { messageId, roomId, reactions });
  return res.json({ messageId, reactions, toggled: !existing });
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  /** Omit or "main" = timeline only; numeric string = thread under that root message id */
  thread: z.string().optional()
});

router.get("/rooms/:roomId/messages", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = listMessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(apiError("Invalid query", "cursor"));

  const limit = parsed.data.limit ?? 50;
  const cursor = parsed.data.cursor ?? null;
  const threadRaw = parsed.data.thread?.trim();

  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: roomSelectAuth
  });
  if (!room) return res.status(404).json(apiError("Room not found"));

  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const clearedBefore = await getMemberClearedBeforeAt(user.id, roomId);

  let threadFilter: { OR?: Array<{ id?: number; threadRootId?: number | null }>; threadRootId?: null } = {
    threadRootId: null
  };
  if (threadRaw && threadRaw !== "main") {
    const tid = Number(threadRaw);
    if (!Number.isFinite(tid) || tid <= 0) return res.status(400).json(apiError("Invalid thread id", "thread"));
    threadFilter = { OR: [{ id: tid }, { threadRootId: tid }] };
  }

  const rowsDesc = await prisma.chatMessage.findMany({
    where: {
      roomId,
      deletedAt: null,
      ...threadFilter,
      ...(clearedBefore ? { createdAt: { gt: clearedBefore } } : {}),
      ...(cursor ? { id: { lt: cursor } } : {})
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    include: messageInclude
  });

  const hasMore = rowsDesc.length > limit;
  const trimmed = hasMore ? rowsDesc.slice(0, limit) : rowsDesc;
  const itemsAsc = trimmed.slice().reverse();
  const ids = itemsAsc.map((m) => m.id);
  const reactMap = await loadReactionsMap(ids);

  const members = await prisma.chatRoomMember.findMany({
    where: { roomId },
    select: { userId: true, lastReadAt: true }
  });

  let threadCountMap = new Map<number, number>();
  if (!threadRaw || threadRaw === "main") {
    const rootIds = itemsAsc.filter((m) => m.threadRootId == null).map((m) => m.id);
    if (rootIds.length) {
      const counts = await prisma.chatMessage.groupBy({
        by: ["threadRootId"],
        where: { roomId, threadRootId: { in: rootIds } },
        _count: { _all: true }
      });
      threadCountMap = new Map(
        counts.map((c) => [c.threadRootId as number, c._count._all])
      );
    }
  }

  return res.json({
    items: itemsAsc.map((m) => {
      const reactions = reactMap.get(m.id) ?? [];
      const rs = attachReadStatusForSender(user.id, members, m);
      const trc =
        (!threadRaw || threadRaw === "main") && m.threadRootId == null
          ? (threadCountMap.get(m.id) ?? 0)
          : undefined;
      return mapMessageRow(
        { ...m, sender: m.sender, replyTo: m.replyTo },
        reactions,
        {
          ...(rs == null ? {} : { readStatus: rs }),
          ...(trc !== undefined ? { threadReplyCount: trc } : {})
        }
      );
    }),
    nextCursor: hasMore ? itemsAsc[0]?.id ?? null : null
  });
});

const patchMemberMeSchema = z.object({
  mutedUntil: z.union([z.string(), z.null()]).optional(),
  notifyPreference: z.enum(["ALL", "MENTIONS", "NONE"]).optional()
});

router.patch("/rooms/:roomId/members/me", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = patchMemberMeSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json(apiError("Invalid body"));

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const data: { mutedUntil?: Date | null; notifyPreference?: string } = {};
  if (parsed.data.mutedUntil !== undefined) {
    if (parsed.data.mutedUntil === null) data.mutedUntil = null;
    else if (typeof parsed.data.mutedUntil === "string" && parsed.data.mutedUntil.trim()) {
      const d = new Date(parsed.data.mutedUntil);
      if (Number.isNaN(d.getTime())) return res.status(400).json(apiError("Invalid mutedUntil"));
      data.mutedUntil = d;
    }
  }
  if (parsed.data.notifyPreference !== undefined) data.notifyPreference = parsed.data.notifyPreference;
  if (Object.keys(data).length === 0) {
    return res.status(400).json(apiError("Provide mutedUntil and/or notifyPreference"));
  }

  await prisma.chatRoomMember.createMany({
    data: [{ roomId, userId: user.id }],
    skipDuplicates: true
  });
  const updated = await prisma.chatRoomMember.update({
    where: { roomId_userId: { roomId, userId: user.id } },
    data,
    select: { mutedUntil: true, notifyPreference: true }
  });
  res.json(updated);
});

const patchRoomSettingsSchema = z.object({
  slowModeSeconds: z.union([z.number().int().min(0).max(3600), z.null()]).optional(),
  adminOnlyPost: z.boolean().optional()
});

router.patch("/rooms/:roomId/settings", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const parsed = patchRoomSettingsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json(apiError("Invalid body"));

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!room) return res.status(404).json(apiError("Room not found"));
  if (room.kind !== "GROUP") return res.status(400).json(apiError("Only group rooms have these settings"));
  try {
    await assertUserCanManageGroupMembers(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  const data: { slowModeSeconds?: number | null; adminOnlyPost?: boolean } = {};
  if ("slowModeSeconds" in parsed.data) data.slowModeSeconds = parsed.data.slowModeSeconds;
  if (parsed.data.adminOnlyPost !== undefined) data.adminOnlyPost = parsed.data.adminOnlyPost;
  if (Object.keys(data).length === 0) return res.status(400).json(apiError("Provide slowModeSeconds and/or adminOnlyPost"));

  const updated = await prisma.chatRoom.update({
    where: { id: roomId },
    data,
    select: { id: true, slowModeSeconds: true, adminOnlyPost: true }
  });
  emitRoom(roomId, "chat:roomUpdated", { roomId, settings: updated });
  res.json(updated);
});

router.get("/rooms/:roomId/export", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));

  const format = String(req.query.format || "txt").toLowerCase();
  if (format !== "txt" && format !== "csv") return res.status(400).json(apiError("format must be txt or csv"));

  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { ...roomSelectAuth, title: true } });
  if (!room) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, room);
  } catch (e) {
    return res.status(403).json(e);
  }

  let from: Date | undefined;
  let to: Date | undefined;
  if (req.query.from) {
    from = new Date(String(req.query.from));
    if (Number.isNaN(from.getTime())) return res.status(400).json(apiError("Invalid from"));
  }
  if (req.query.to) {
    to = new Date(String(req.query.to));
    if (Number.isNaN(to.getTime())) return res.status(400).json(apiError("Invalid to"));
  }

  const clearedBefore = await getMemberClearedBeforeAt(user.id, roomId);

  const rows = await prisma.chatMessage.findMany({
    where: {
      roomId,
      deletedAt: null,
      ...(clearedBefore ? { createdAt: { gt: clearedBefore } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {})
    },
    orderBy: { id: "asc" },
    include: { sender: { select: { email: true } } }
  });

  const title = room.title || room.roomKey || `room-${roomId}`;
  const safeName = String(title).replace(/[^\w.-]+/g, "_").slice(0, 80);

  if (format === "csv") {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["id", "createdAt", "senderEmail", "body"].map(esc).join(",");
    const lines = rows.map((r) =>
      [r.id, r.createdAt.toISOString(), r.sender?.email ?? "", (r.body || "").replace(/\r?\n/g, "\\n")]
        .map(esc)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="chat-${safeName}.csv"`);
    return res.send("\uFEFF" + [header, ...lines].join("\r\n"));
  }

  const text = rows
    .map(
      (r) =>
        `[${r.createdAt.toISOString()}] ${r.sender?.email ?? r.senderId}: ${(r.body || "").replace(/\r?\n/g, "\n")}`
    )
    .join("\n\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="chat-${safeName}.txt"`);
  return res.send(text);
});

const forwardBodySchema = z.object({
  targetRoomId: z.number().int().positive()
});

router.post("/rooms/:roomId/messages/:messageId/forward", async (req, res) => {
  const user = req.user!;
  const roomId = Number(req.params.roomId);
  const messageId = Number(req.params.messageId);
  if (!Number.isFinite(roomId) || roomId <= 0) return res.status(400).json(apiError("Invalid room id"));
  if (!Number.isFinite(messageId) || messageId <= 0) return res.status(400).json(apiError("Invalid message id"));

  const parsed = forwardBodySchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json(apiError("Invalid body", "targetRoomId"));

  const srcRoom = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: roomSelectAuth });
  if (!srcRoom) return res.status(404).json(apiError("Room not found"));
  try {
    await assertUserCanAccessChatRoom(user, srcRoom);
  } catch (e) {
    return res.status(403).json(e);
  }

  const tgtRoom = await prisma.chatRoom.findUnique({
    where: { id: parsed.data.targetRoomId },
    select: roomSelectAuth
  });
  if (!tgtRoom) return res.status(404).json(apiError("Target room not found"));
  try {
    await assertUserCanAccessChatRoom(user, tgtRoom);
  } catch (e) {
    return res.status(403).json(e);
  }

  if (tgtRoom.kind === "GROUP" && tgtRoom.adminOnlyPost) {
    if (user.role !== "ADMIN" && user.id !== tgtRoom.createdById) {
      return res.status(403).json(apiError("Only admins can post in target room"));
    }
  }

  const src = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId, deletedAt: null },
    include: { sender: { select: { email: true } } }
  });
  if (!src) return res.status(404).json(apiError("Message not found"));
  if (isE2eeEncryptedBody(src.body)) {
    return res.status(400).json(apiError("Cannot forward end-to-end encrypted messages", "forward"));
  }
  if (isE2eeAttachmentKind(src.attachmentKind)) {
    return res.status(400).json(apiError("Cannot forward end-to-end encrypted attachments", "forward"));
  }

  const bodyText =
    (src.body && src.body.trim()) ||
    (src.attachmentUrl ? `[attachment: ${src.attachmentName || "file"}]` : "(empty)");

  const created = await prisma.chatMessage.create({
    data: {
      roomId: parsed.data.targetRoomId,
      senderId: user.id,
      body: `↪ Forwarded: ${bodyText}`,
      forwardedFromId: src.id,
      mentionedUserIds: []
    },
    include: messageInclude
  });

  const reactMap = await loadReactionsMap([created.id]);
  const reactions = reactMap.get(created.id) ?? [];
  const members = await prisma.chatRoomMember.findMany({
    where: { roomId: parsed.data.targetRoomId },
    select: { userId: true, lastReadAt: true }
  });
  const rs = attachReadStatusForSender(user.id, members, created);
  const out = mapMessageRow(
    { ...created, sender: created.sender, replyTo: created.replyTo },
    reactions,
    rs == null ? undefined : { readStatus: rs }
  );

  const io = getChatIo();
  io?.to(String(parsed.data.targetRoomId)).emit("chat:messageCreated", out);
  res.json(out);
});

export default router;
