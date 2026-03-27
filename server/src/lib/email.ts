import { EMAIL_EVENTS, enqueueEmail } from "../services/emailBus.js";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  enqueueEmail({
    type: EMAIL_EVENTS.PASSWORD_RESET,
    recipient: to,
    payload: { link: resetUrl },
    dedupeKey: `password-reset:${to.toLowerCase().trim()}`
  });
}

export type MeetingReminderPayload = {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  meetingsUrl: string;
};

/** Sends one email with all recipients in BCC if multiple, else To. */
export async function sendMeetingReminderEmail(
  recipients: string[],
  meeting: MeetingReminderPayload
): Promise<void> {
  if (recipients.length === 0) return;
  enqueueEmail({
    type: EMAIL_EVENTS.MEETING_REMINDER,
    recipient: recipients,
    payload: {
      title: meeting.title,
      date: meeting.date,
      time: meeting.time,
      location: meeting.location,
      meetingsUrl: meeting.meetingsUrl
    },
    dedupeKey: `meeting-reminder:${meeting.title}:${meeting.date}`
  });
}
