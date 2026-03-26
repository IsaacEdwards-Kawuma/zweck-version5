-- DropIndex
DROP INDEX "ChatRoom_createdById_idx";

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "companyName" VARCHAR(200) NOT NULL DEFAULT 'Zweck Tukula Co. Ltd',
    "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "defaultReportDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatRoom_kind_idx" ON "ChatRoom"("kind");
