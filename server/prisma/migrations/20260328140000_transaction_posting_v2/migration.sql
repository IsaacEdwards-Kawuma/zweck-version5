-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ATTACHED', 'MISSING', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "TransactionPostingStatus" AS ENUM ('POSTED', 'REVERSED', 'PENDING');

-- CreateTable
CREATE TABLE "ReferenceSequence" (
    "yearMonth" VARCHAR(7) NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ReferenceSequence_pkey" PRIMARY KEY ("yearMonth")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "referenceNumber" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "externalReference" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "documentUrl" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'MISSING';
ALTER TABLE "Transaction" ADD COLUMN "postingStatus" "TransactionPostingStatus" NOT NULL DEFAULT 'POSTED';
ALTER TABLE "Transaction" ADD COLUMN "reversalOfId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "expensePaymentMode" VARCHAR(24);
ALTER TABLE "Transaction" ADD COLUMN "projectId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "transferFromAccountKey" VARCHAR(40);
ALTER TABLE "Transaction" ADD COLUMN "transferToAccountKey" VARCHAR(40);

-- Backfill unique reference numbers for existing rows
UPDATE "Transaction" SET "referenceNumber" = 'ZWK-MIGR-' || id::text WHERE "referenceNumber" IS NULL;

ALTER TABLE "Transaction" ALTER COLUMN "referenceNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Transaction_referenceNumber_key" ON "Transaction"("referenceNumber");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum (PostgreSQL: one new value per statement is safest)
ALTER TYPE "TxType" ADD VALUE 'RENTAL_INCOME';
ALTER TYPE "TxType" ADD VALUE 'DIRECTOR_FEE_ALLOWANCE';
ALTER TYPE "TxType" ADD VALUE 'INTER_ACCOUNT_TRANSFER';
ALTER TYPE "TxType" ADD VALUE 'RETAINED_EARNINGS_TRANSFER';
