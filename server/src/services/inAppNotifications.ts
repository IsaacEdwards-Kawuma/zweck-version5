import { prisma } from "../lib/prisma.js";

export async function notifyUser(
  userId: number,
  type: string,
  title: string,
  body?: string | null,
  link?: string | null,
  meetingId?: number | null
) {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body: body ?? null,
      link: link ?? null,
      meetingId: meetingId ?? null
    }
  });
}
