import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

/** Current calendar month in UTC as YYYY-MM. */
export function utcYearMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function utcIsFirstCalendarDay(now: Date = new Date()): boolean {
  return now.getUTCDate() === 1;
}

export type MonthlyStatementReminderJobResult = {
  skipped: boolean;
  reason?: "not_first_of_month" | "already_sent_this_month";
  yearMonth: string;
  recipientCount: number;
  sent: number;
  errors: string[];
};

/**
 * On the first calendar day of each month (UTC), notify every ADMIN and DIRECTOR (active, not removed or blocked)
 * to review monthly financial statements in Reports. Idempotent per month via MonthlyStatementReminderSent.
 *
 * Schedule: call daily from the same cron as other jobs; this no-ops except on the 1st.
 */
export async function runMonthlyStatementReminderJob(
  now: Date = new Date()
): Promise<MonthlyStatementReminderJobResult> {
  const yearMonth = utcYearMonth(now);
  const errors: string[] = [];

  if (!utcIsFirstCalendarDay(now)) {
    return {
      skipped: true,
      reason: "not_first_of_month",
      yearMonth,
      recipientCount: 0,
      sent: 0,
      errors
    };
  }

  const users = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "DIRECTOR"] },
      deletedAt: null,
      isActive: true,
      adminBlockedAt: null
    },
    select: { id: true }
  });

  const monthLabel = now.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });

  const title = "Monthly financial statement";
  const body = `It is the first day of ${monthLabel} (UTC). Open Reports to review statements, exports, and print layouts for the period.`;
  const link = "/reports";

  const notificationRows = users.map((u) => ({
    userId: u.id,
    type: "MONTHLY_STATEMENT_REMINDER",
    title,
    body,
    link
  }));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.monthlyStatementReminderSent.create({ data: { yearMonth } });
      if (notificationRows.length > 0) {
        await tx.notification.createMany({ data: notificationRows });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        skipped: true,
        reason: "already_sent_this_month",
        yearMonth,
        recipientCount: 0,
        sent: 0,
        errors
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    logger.error(e, "[monthly-statement-reminders] failed");
    return {
      skipped: false,
      yearMonth,
      recipientCount: users.length,
      sent: 0,
      errors
    };
  }

  logger.info({ yearMonth, sent: users.length }, "[monthly-statement-reminders] sent");

  return {
    skipped: false,
    yearMonth,
    recipientCount: users.length,
    sent: users.length,
    errors
  };
}
