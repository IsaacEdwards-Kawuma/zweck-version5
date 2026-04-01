-- Mini CRM for company secretary (contacts, interactions, reminders, document links).

CREATE TYPE "CrmInteractionType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'OTHER');

CREATE TABLE "CrmContact" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "company" VARCHAR(200),
    "phone" VARCHAR(50),
    "email" VARCHAR(200),
    "address" VARCHAR(500),
    "notes" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmContact_isDeleted_updatedAt_idx" ON "CrmContact"("isDeleted", "updatedAt");
CREATE INDEX "CrmContact_name_idx" ON "CrmContact"("name");

ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CrmInteraction" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "type" "CrmInteractionType" NOT NULL,
    "title" VARCHAR(300),
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmInteraction_contactId_occurredAt_idx" ON "CrmInteraction"("contactId", "occurredAt");
CREATE INDEX "CrmInteraction_meetingId_idx" ON "CrmInteraction"("meetingId");

ALTER TABLE "CrmInteraction" ADD CONSTRAINT "CrmInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmInteraction" ADD CONSTRAINT "CrmInteraction_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmInteraction" ADD CONSTRAINT "CrmInteraction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CrmReminder" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmReminder_contactId_dueAt_idx" ON "CrmReminder"("contactId", "dueAt");
CREATE INDEX "CrmReminder_done_dueAt_idx" ON "CrmReminder"("done", "dueAt");

ALTER TABLE "CrmReminder" ADD CONSTRAINT "CrmReminder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmReminder" ADD CONSTRAINT "CrmReminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CrmContactDocument" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmContactDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmContactDocument_contactId_documentId_key" ON "CrmContactDocument"("contactId", "documentId");
CREATE INDEX "CrmContactDocument_documentId_idx" ON "CrmContactDocument"("documentId");

ALTER TABLE "CrmContactDocument" ADD CONSTRAINT "CrmContactDocument_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmContactDocument" ADD CONSTRAINT "CrmContactDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
