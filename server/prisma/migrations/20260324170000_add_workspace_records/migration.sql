-- Meetings storage
CREATE TABLE IF NOT EXISTS "Meeting" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "time" TEXT,
  "location" TEXT,
  "chairperson" TEXT,
  "attendees" TEXT,
  "attendanceCount" INTEGER,
  "expectedAttendees" INTEGER,
  "meetingType" TEXT DEFAULT 'Board',
  "priority" TEXT DEFAULT 'Medium',
  "recurrence" TEXT DEFAULT 'NONE',
  "reminderDays" INTEGER,
  "agenda" TEXT,
  "actionItems" TEXT,
  "notes" TEXT,
  "nextMeetingDate" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "createdById" INTEGER,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Meeting_date_idx" ON "Meeting"("date");
CREATE INDEX IF NOT EXISTS "Meeting_status_idx" ON "Meeting"("status");

-- Documents register storage
CREATE TABLE IF NOT EXISTS "DocumentRegister" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Governance',
  "reference" TEXT,
  "owner" TEXT,
  "confidentiality" TEXT NOT NULL DEFAULT 'Internal',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" TEXT DEFAULT '1.0',
  "tags" TEXT,
  "effectiveDate" TEXT,
  "reviewDate" TEXT,
  "expiryDate" TEXT,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "url" TEXT,
  "notes" TEXT,
  "createdById" INTEGER,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DocumentRegister_status_idx" ON "DocumentRegister"("status");
CREATE INDEX IF NOT EXISTS "DocumentRegister_category_idx" ON "DocumentRegister"("category");

-- Reconciliation notes per period
CREATE TABLE IF NOT EXISTS "ReconciliationNote" (
  "id" SERIAL PRIMARY KEY,
  "periodFrom" TEXT NOT NULL,
  "statementDate" TEXT NOT NULL,
  "notes" TEXT,
  "clearedMap" JSONB,
  "createdById" INTEGER,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationNote_periodFrom_statementDate_key"
  ON "ReconciliationNote"("periodFrom", "statementDate");
