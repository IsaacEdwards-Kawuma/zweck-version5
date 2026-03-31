-- Idempotency for cron: one reminder batch per UTC calendar month
CREATE TABLE IF NOT EXISTS "MonthlyStatementReminderSent" (
    "id" SERIAL NOT NULL,
    "yearMonth" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyStatementReminderSent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyStatementReminderSent_yearMonth_key" ON "MonthlyStatementReminderSent"("yearMonth");
