import { Resend } from "resend";
import { logger } from "../lib/logger.js";

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
};

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function emailFromAddress() {
  return process.env.RESEND_FROM?.trim() || "Zweck <onboarding@resend.dev>";
}

export function canSendEmail() {
  return Boolean(resend);
}

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
  if (!resend) {
    logger.info({ to, subject }, "[email] RESEND_API_KEY not set; skipping email send");
    return { skipped: true as const };
  }
  try {
    return await resend.emails.send({
      from: emailFromAddress(),
      to,
      subject,
      html
    });
  } catch (err) {
    logger.error({ err, to, subject }, "[email] resend send failed");
    throw err;
  }
}

