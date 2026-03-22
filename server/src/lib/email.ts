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
