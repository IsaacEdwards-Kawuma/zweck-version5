/** Extract @user@domain.tld patterns from chat body. */
const MENTION_RE = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

export function parseMentionEmails(body: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((m = re.exec(body)) !== null) {
    if (m[1]) set.add(m[1].toLowerCase());
  }
  return [...set];
}

export async function resolveMentionUserIds(emails: string[], mentionable: Set<number>): Promise<number[]> {
  if (!emails.length) return [];
  const { prisma } = await import("./prisma.js");
  const users = await prisma.user.findMany({
    where: {
      OR: emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } }))
    },
    select: { id: true }
  });
  return users.filter((u) => mentionable.has(u.id)).map((u) => u.id);
}

/** Members of a GROUP/DM room; MEETING/PROJECT allow mentioning any registered user. */
export async function getMentionableUserIds(roomId: number, roomKind: string): Promise<Set<number>> {
  const { prisma } = await import("./prisma.js");
  if (roomKind === "MEETING" || roomKind === "PROJECT") {
    const users = await prisma.user.findMany({ select: { id: true } });
    return new Set(users.map((u) => u.id));
  }
  const rows = await prisma.chatRoomMember.findMany({
    where: { roomId },
    select: { userId: true }
  });
  return new Set(rows.map((r) => r.userId));
}
