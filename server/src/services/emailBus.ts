import { logger } from "../lib/logger.js";
import {
  meetingReminderEmail,
  notificationEmail,
  passwordResetEmail,
  reportReadyEmail,
  transactionPostedEmail,
  welcomeEmail
} from "../templates/emailTemplates.js";
import { sendEmail } from "./emailService.js";

export const EMAIL_EVENTS = {
  USER_CREATED: "USER_CREATED",
  PASSWORD_RESET: "PASSWORD_RESET",
  TX_POSTED: "TX_POSTED",
  REPORT_READY: "REPORT_READY",
  NOTIFICATION: "NOTIFICATION",
  MEETING_REMINDER: "MEETING_REMINDER"
} as const;

type EmailEventType = (typeof EMAIL_EVENTS)[keyof typeof EMAIL_EVENTS];

type EmailEvent = {
  type: EmailEventType;
  recipient: string | string[];
  payload: Record<string, unknown>;
  dedupeKey?: string;
};

const queue: EmailEvent[] = [];
let workerTimer: NodeJS.Timeout | null = null;
let processing = false;
let dayKey = new Date().toISOString().slice(0, 10);
let sentToday = 0;

const DAILY_LIMIT = Math.max(1, Number(process.env.EMAIL_DAILY_LIMIT || 95));
const MAX_PER_TICK = Math.max(1, Number(process.env.EMAIL_MAX_PER_TICK || 10));
const TICK_MS = Math.max(5_000, Number(process.env.EMAIL_QUEUE_TICK_MS || 60_000));
const DEDUPE_WINDOW_MS = Math.max(60_000, Number(process.env.EMAIL_DEDUPE_WINDOW_MS || 5 * 60_000));
const dedupeMap = new Map<string, number>();

function currentUtcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function canSendToday() {
  const today = currentUtcDayKey();
  if (today !== dayKey) {
    dayKey = today;
    sentToday = 0;
  }
  return sentToday < DAILY_LIMIT;
}

function markSent() {
  sentToday += 1;
}

function shouldDedupe(key: string | undefined) {
  if (!key) return false;
  const now = Date.now();
  const last = dedupeMap.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  dedupeMap.set(key, now);
  if (dedupeMap.size > 5000) {
    for (const [k, t] of dedupeMap.entries()) {
      if (now - t > DEDUPE_WINDOW_MS) dedupeMap.delete(k);
    }
  }
  return false;
}

export function enqueueEmail(event: EmailEvent) {
  if (!event?.recipient) return;
  if (shouldDedupe(event.dedupeKey)) return;
  queue.push(event);
}

function renderEmail(event: EmailEvent): { subject: string; html: string } | null {
  switch (event.type) {
    case EMAIL_EVENTS.USER_CREATED:
      return {
        subject: "Welcome to Zweck",
        html: welcomeEmail(String(event.payload.name || ""))
      };
    case EMAIL_EVENTS.PASSWORD_RESET:
      return {
        subject: "Password Reset Request",
        html: passwordResetEmail(String(event.payload.link || ""))
      };
    case EMAIL_EVENTS.TX_POSTED:
      return {
        subject: "Transaction Posted",
        html: transactionPostedEmail(
          String(event.payload.referenceNumber || ""),
          Number(event.payload.amount || 0),
          String(event.payload.currency || "EUR")
        )
      };
    case EMAIL_EVENTS.REPORT_READY:
      return {
        subject: "Your Report Is Ready",
        html: reportReadyEmail(String(event.payload.link || ""))
      };
    case EMAIL_EVENTS.NOTIFICATION:
      return {
        subject: String(event.payload.subject || "New Notification"),
        html: notificationEmail(String(event.payload.message || "You have a new notification."))
      };
    case EMAIL_EVENTS.MEETING_REMINDER:
      return {
        subject: `Reminder: ${String(event.payload.title || "Meeting")}`,
        html: meetingReminderEmail(
          String(event.payload.title || "Meeting"),
          String(event.payload.date || ""),
          (event.payload.time as string | null) ?? null,
          (event.payload.location as string | null) ?? null,
          String(event.payload.meetingsUrl || "")
        )
      };
    default:
      return null;
  }
}

export async function processEmailQueue() {
  if (processing) return;
  processing = true;
  try {
    let sentThisTick = 0;
    while (queue.length > 0 && sentThisTick < MAX_PER_TICK) {
      if (!canSendToday()) {
        logger.warn({ queued: queue.length, sentToday, DAILY_LIMIT }, "[email] daily cap reached; queue retained");
        break;
      }
      const event = queue.shift();
      if (!event) break;
      const rendered = renderEmail(event);
      if (!rendered) {
        logger.warn({ type: event.type }, "[email] unknown event type");
        continue;
      }
      await sendEmail({
        to: event.recipient,
        subject: rendered.subject,
        html: rendered.html
      });
      sentThisTick += 1;
      markSent();
    }
  } catch (err) {
    logger.error({ err }, "[email] queue processing error");
  } finally {
    processing = false;
  }
}

export function startEmailQueueWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processEmailQueue();
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS, maxPerTick: MAX_PER_TICK, dailyLimit: DAILY_LIMIT }, "[email] queue worker started");
}

export function getEmailQueueStats() {
  const today = currentUtcDayKey();
  const currentSentToday = today === dayKey ? sentToday : 0;
  return {
    queueDepth: queue.length,
    processing,
    sentToday: currentSentToday,
    dailyLimit: DAILY_LIMIT,
    maxPerTick: MAX_PER_TICK,
    tickMs: TICK_MS,
    dedupeWindowMs: DEDUPE_WINDOW_MS
  };
}

