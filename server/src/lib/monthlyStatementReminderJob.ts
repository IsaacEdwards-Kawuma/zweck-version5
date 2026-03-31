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

/** Previous calendar month as YYYY-MM (UTC). On 1 Mar → 2026-02. */
export function utcPreviousYearMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/** Deep link to Reports monthly statement panel for a YYYY-MM period. */
export function buildMonthlyStatementReportLink(statementPeriod: string): string {
  return `/reports?monthly=1&period=${encodeURIComponent(statementPeriod)}`;
}

const MONTHLY_STATEMENT_ROLES = [
  "ADMIN",
  "ADMIN_DIRECTOR",
  "DIRECTOR",
  "TREASURER",
  "CEO",
  "OPERATIONAL_MANAGER"
] as const;

/**
 * On the first calendar day of each month (UTC), notify leadership roles (active, not removed or blocked)
 * that the prior month’s figures are available in Reports. Idempotent per month via MonthlyStatementReminderSent.
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
      role: { in: [...MONTHLY_STATEMENT_ROLES] },
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

  const statementPeriod = utcPreviousYearMonth(now);
  const periodParts = /^(\d{4})-(\d{2})$/.exec(statementPeriod);
  const py = periodParts ? Number(periodParts[1]) : NaN;
  const pm = periodParts ? Number(periodParts[2]) : NaN;
  const periodLabel =
    Number.isFinite(py) && Number.isFinite(pm) && pm >= 1 && pm <= 12
      ? new Date(Date.UTC(py, pm - 1, 15)).toLocaleString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC"
        })
      : statementPeriod;

  const title = "Monthly financial statement ready";
  const body = `It is the first day of ${monthLabel} (UTC). Statements for ${periodLabel} are ready — open the link to view, export CSV, or print (P&L, balance sheet, cash flow).`;
  const link = buildMonthlyStatementReportLink(statementPeriod);

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
