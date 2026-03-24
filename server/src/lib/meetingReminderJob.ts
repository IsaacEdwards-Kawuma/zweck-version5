import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { sendMeetingReminderEmail } from "./email.js";
import { getPublicAppUrl } from "./publicAppUrl.js";

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

export type MeetingReminderJobResult = {
  checked: number;
  sent: number;
  skipped: number;
  errors: string[];
};

/**
 * Send one reminder email per eligible meeting when today (UTC date) equals
 * meeting.date minus reminderDays. Recipients: opted-in admins, directors, and the meeting creator (if any).
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

    const recipients = await prisma.user.findMany({
      where: {
        emailMeetingReminders: true,
        OR: [
          { role: "ADMIN" },
          { role: "DIRECTOR" },
          ...(meeting.createdById != null ? [{ id: meeting.createdById }] : [])
        ]
      },
      select: { email: true }
    });

    const emails = [...new Set(recipients.map((r) => r.email.toLowerCase()))];
    if (emails.length === 0) {
      await prisma.meetingReminderSent.create({ data: { meetingId: meeting.id } });
      skipped += 1;
      continue;
    }

    const appUrl = getPublicAppUrl() || "http://localhost:5173";

    try {
      await sendMeetingReminderEmail(emails, {
        title: meeting.title,
        date: meeting.date,
        time: meeting.time,
        location: meeting.location,
        meetingsUrl: `${appUrl}/meetings`
      });
      await prisma.meetingReminderSent.create({ data: { meetingId: meeting.id } });
      sent += 1;
      logger.info({ meetingId: meeting.id, toCount: emails.length }, "[meeting-reminders] sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`meeting ${meeting.id}: ${msg}`);
      logger.error(e, `[meeting-reminders] meeting ${meeting.id} failed`);
    }
  }

  return { checked: meetings.length, sent, skipped, errors };
}
