import { prisma } from "./prisma.js";
import { apiError } from "./http.js";
import type { AuthUser } from "../middleware/auth.js";

export type ChatRoomForAuth = {
  id: number;
  kind: string;
  roomKey: string;
  meetingId: number | null;
  projectId: number | null;
};

export function getChatRoomKey(kind: string, id: number): string {
  return `${kind}:${id}`;
}

export function normalizeChatBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const t = body.trim();
  if (!t) return null;
  if (t.length > 5000) return null;
  return t;
}

function parseDmRoomKey(roomKey: string): { a: number; b: number } | null {
  // Expected: DM:<low>:<high>
  const m = /^DM:(\d+):(\d+)$/.exec(roomKey);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

export async function assertUserCanAccessChatRoom(user: AuthUser, room: ChatRoomForAuth): Promise<void> {
  // Meetings + Projects are public discussion rooms (everyone can join/send).
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

