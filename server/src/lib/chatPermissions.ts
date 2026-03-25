import { prisma } from "./prisma.js";
import { apiError } from "./http.js";
import type { AuthUser } from "../middleware/auth.js";

export type ChatRoomForAuth = {
  id: number;
  kind: string;
  roomKey: string;
  meetingId: number | null;
  projectId: number | null;
  createdById: number | null;
};

export function getChatRoomKey(kind: string, id: number): string {
  return `${kind}:${id}`;
}

const MAX_BODY = 5000;

export function normalizeChatBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const t = body.trim();
  if (!t) return null;
  if (t.length > MAX_BODY) return null;
  return t;
}

/** Body for send/edit: empty allowed when sending with an attachment only. */
export function normalizeChatBodyWithAttachment(body: unknown, hasAttachment: boolean): string | null {
  if (typeof body !== "string") return null;
  const t = body.trim();
  if (t.length > MAX_BODY) return null;
  if (!t && !hasAttachment) return null;
  return t;
}

function parseDmRoomKey(roomKey: string): { a: number; b: number } | null {
  const m = /^DM:(\d+):(\d+)$/.exec(roomKey);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

export async function assertUserCanAccessChatRoom(user: AuthUser, room: ChatRoomForAuth): Promise<void> {
  if (room.kind === "MEETING" || room.kind === "PROJECT") return;

  if (room.kind === "DM") {
    const parsed = parseDmRoomKey(room.roomKey);
    if (!parsed) throw apiError("Forbidden", "chatRoom");
    if (parsed.a !== user.id && parsed.b !== user.id) throw apiError("Forbidden", "chatRoom");
    return;
  }

  if (room.kind === "GROUP") {
    const member = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: user.id } }
    });
    if (!member) throw apiError("Forbidden", "chatRoom");
    return;
  }

  throw apiError("Forbidden", "chatRoom");
}

/** GROUP room: creator or ADMIN can add/remove members. If creator unknown (legacy), only ADMIN. */
export async function assertUserCanManageGroupMembers(user: AuthUser, room: ChatRoomForAuth): Promise<void> {
  if (room.kind !== "GROUP") throw apiError("Forbidden", "chatRoom");
  if (user.role === "ADMIN") return;
  if (room.createdById != null && room.createdById === user.id) return;
  throw apiError("Forbidden", "chatRoom");
}

export function assertUserOwnsMessage(user: AuthUser, senderId: number): void {
  if (senderId !== user.id) throw apiError("Forbidden", "message");
}

/** Delete own message, or any message in the room if ADMIN. */
export function assertUserCanDeleteMessage(user: AuthUser, senderId: number): void {
  if (senderId === user.id) return;
  if (user.role === "ADMIN") return;
  throw apiError("Forbidden", "message");
}
