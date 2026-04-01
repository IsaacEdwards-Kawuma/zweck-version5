-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inAppTaskAssigned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppDocumentShared" BOOLEAN NOT NULL DEFAULT true;
