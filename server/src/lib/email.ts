/**
 * Legacy module name kept for meeting reminder job import path.
 * Outbound email (Resend) has been removed; meeting reminders use in-app notifications only.
 */
export type MeetingReminderPayload = {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  meetingsUrl: string;
};
