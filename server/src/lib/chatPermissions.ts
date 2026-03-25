import { prisma } from "./prisma.js";
import { apiError } from "./http.js";
import type { AuthUser } from "../middleware/auth.js";

export type ChatRoomForAuth = {
  id: number;
  kind: string;
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

export async function assertUserCanAccessChatRoom(user: AuthUser, room: ChatRoomForAuth): Promise<void> {
  if (room.kind === "MEETING") {
    if (!room.meetingId) throw apiError("Meeting chat room not found");
    const meeting = await prisma.meeting.findUnique({
      where: { id: room.meetingId },
      select: { createdById: true }
    });
    if (!meeting || meeting.createdById !== user.id) {
      throw apiError("Forbidden", "chatRoom");
    }
    return;
  }

  if (room.kind === "PROJECT") {
    if (!room.projectId) throw apiError("Project chat room not found");
    const project = await prisma.project.findUnique({
      where: { id: room.projectId },
      select: { createdById: true, leaderDirectorId: true }
    });
    if (!project) throw apiError("Forbidden", "chatRoom");

    const isCreator = project.createdById === user.id;
    const isLeader =
      project.leaderDirectorId != null && user.directorId != null && project.leaderDirectorId === user.directorId;

    if (!isCreator && !isLeader) throw apiError("Forbidden", "chatRoom");
    return;
  }

  throw apiError("Forbidden", "chatRoom");
}

