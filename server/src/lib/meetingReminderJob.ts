import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

/** Calendar date yyyy-mm-dd in UTC for "today". */
function utcTodayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Subtract whole calendar days from yyyy-mm-dd (UTC calendar). Exported for tests. */
export function subtractDaysYmd(yyyyMmDd: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

function meetingReminderBodyLines(date: string, time: string | null, location: string | null): string {
  const when = [date, time].filter(Boolean).join(" · ");
  const parts = [`When: ${when}`];
  if (location) parts.push(`Location: ${location}`);
  return parts.join("\n");
}

export type MeetingReminderJobResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

/**
 * Send one reminder email per eligible meeting when today (UTC date) equals
 * meeting.date minus reminderDays. Recipients: opted-in admins, directors, and the meeting creator (if any).
 * In-app notifications use the same audience with inAppMeetingReminders.
 */
export async function runMeetingReminderJob(): Promise<MeetingReminderJobResult> {
  const today = utcTodayYmd();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const meetings = await prisma.meeting.findMany({
    where: {
      status: "SCHEDULED",
      reminderDays: { not: null, gt: 0 },
      reminderSent: null
    }
  });

  for (const meeting of meetings) {
    const rd = meeting.reminderDays;
    if (rd == null || rd <= 0) {
      skipped += 1;
      continue;
    }
    const sendOn = subtractDaysYmd(meeting.date, rd);
    if (!sendOn || sendOn !== today) {
      skipped += 1;
      continue;
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { role: "ADMIN" },
          { role: "ADMIN_DIRECTOR" },
          { role: "DIRECTOR" },
          ...(meeting.createdById != null ? [{ id: meeting.createdById }] : [])
        ]
      },
      select: {
        id: true,
        inAppMeetingReminders: true
      }
    });

    const inAppUsers = users.filter((u) => u.inAppMeetingReminders);

    if (inAppUsers.length === 0) {
      await prisma.meetingReminderSent.create({ data: { meetingId: meeting.id } });
      skipped += 1;
      continue;
    }

    try {
      const body = meetingReminderBodyLines(meeting.date, meeting.time, meeting.location);
      await prisma.notification.createMany({
        data: inAppUsers.map((u) => ({
          userId: u.id,
          type: "MEETING_REMINDER",
          title: `Reminder: ${meeting.title}`,
          body,
          link: "/meetings",
          meetingId: meeting.id
        }))
      });
      await prisma.meetingReminderSent.create({ data: { meetingId: meeting.id } });
      sent += 1;
      logger.info({ meetingId: meeting.id, inAppCount: inAppUsers.length }, "[meeting-reminders] sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`meeting ${meeting.id}: ${msg}`);
      logger.error(e, `[meeting-reminders] meeting ${meeting.id} failed`);
    }
  }

  return { checked: meetings.length, sent, skipped, errors };
}
