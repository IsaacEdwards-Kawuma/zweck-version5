import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "noreply@localhost";

  const text = `Reset your ZweckOS password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `<p>Reset your ZweckOS password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`;

  if (!host) {
    logger.info({ to, resetUrl }, "[email] SMTP not configured — password reset link (set SMTP_HOST to send mail)");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined
  });

  await transporter.sendMail({
    from,
    to,
    subject: "ZweckOS password reset",
    text,
    html
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
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "noreply@localhost";

  const when = [meeting.date, meeting.time].filter(Boolean).join(" · ");
  const loc = meeting.location ? `\nLocation: ${meeting.location}` : "";
  const text = `Reminder: ${meeting.title}\nWhen: ${when}${loc}\n\nOpen meetings: ${meeting.meetingsUrl}`;
  const html = `<p><strong>Reminder:</strong> ${escapeHtml(meeting.title)}</p><p><strong>When:</strong> ${escapeHtml(when)}${meeting.location ? `</p><p><strong>Location:</strong> ${escapeHtml(meeting.location)}` : ""}</p><p><a href="${meeting.meetingsUrl}">Open Meetings in ZweckOS</a></p>`;

  if (!host) {
    logger.info({ to: recipients, meeting: meeting.title }, "[email] SMTP not configured — meeting reminder not sent");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined
  });

  const [first, ...rest] = recipients;
  if (!first) return;

  await transporter.sendMail({
    from,
    to: first,
    bcc: rest.length ? rest : undefined,
    subject: `Reminder: ${meeting.title} (${meeting.date})`,
    text,
    html
  });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
