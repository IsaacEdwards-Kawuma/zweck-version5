-- Director transaction system v2: new director tx types, receipt/batch tracking, distributions, and loans.
-- Note: uses IF EXISTS / exception guards to support mixed dev databases.

-- 1) TxType enum additions (Postgres)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TxType') THEN
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'CONTRIBUTION_ARREARS';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'SUPPLEMENTARY_CAPITAL_CONTRIBUTION';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'DIRECTORS_CAPITAL_DISTRIBUTION';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'CAPITAL_REINSTATEMENT';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'DIRECTORS_DISCIPLINARY_LEVY';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'COMPANY_LOAN_TO_DIRECTOR';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'DIRECTOR_REPAYMENT_OF_COMPANY_LOAN';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- 2) Director reference sequences (per type per month)
CREATE TABLE IF NOT EXISTS "DirectorReferenceSequence" (
  "yearMonth" VARCHAR(7) NOT NULL,
  "typeKey"   VARCHAR(8) NOT NULL,
  "lastSeq"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DirectorReferenceSequence_pkey" PRIMARY KEY ("yearMonth","typeKey")
);

-- 3) Director tx batch + receipts
CREATE TABLE IF NOT EXISTS "DirectorTransactionBatch" (
  "id"               SERIAL PRIMARY KEY,
  "directorId"       INTEGER NOT NULL,
  "typeKey"          VARCHAR(32) NOT NULL,
  "receiptReference" VARCHAR(48) NOT NULL UNIQUE,
  "periodMonth"      VARCHAR(7) NOT NULL,
  "transactionDate"  TIMESTAMP(3) NOT NULL,
  "totalAmount"      DECIMAL(18,2) NOT NULL,
  "currency"         VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "meta"             JSONB,
  "createdBy"        INTEGER NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DirectorTransactionBatch_directorId_transactionDate_idx"
  ON "DirectorTransactionBatch" ("directorId","transactionDate");
CREATE INDEX IF NOT EXISTS "DirectorTransactionBatch_typeKey_periodMonth_idx"
  ON "DirectorTransactionBatch" ("typeKey","periodMonth");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DirectorEntryLineSide') THEN
    CREATE TYPE "DirectorEntryLineSide" AS ENUM ('DEBIT','CREDIT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DirectorReceiptPdfStatus') THEN
    CREATE TYPE "DirectorReceiptPdfStatus" AS ENUM ('PENDING','READY','FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DirectorCapitalDistributionStatus') THEN
    CREATE TYPE "DirectorCapitalDistributionStatus" AS ENUM ('OPEN','PARTIALLY_REINSTATED','FULLY_REINSTATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyLoanToDirectorStatus') THEN
    CREATE TYPE "CompanyLoanToDirectorStatus" AS ENUM ('OPEN','PARTIALLY_REPAID','FULLY_REPAID');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "DirectorTransactionLine" (
  "id"        SERIAL PRIMARY KEY,
  "batchId"   INTEGER NOT NULL,
  "side"      "DirectorEntryLineSide" NOT NULL,
  "accountKey" VARCHAR(64) NOT NULL,
  "directorId" INTEGER,
  "amount"    DECIMAL(18,2) NOT NULL,
  "memo"      VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DirectorTransactionLine_batchId_idx" ON "DirectorTransactionLine" ("batchId");
CREATE INDEX IF NOT EXISTS "DirectorTransactionLine_accountKey_idx" ON "DirectorTransactionLine" ("accountKey");
CREATE INDEX IF NOT EXISTS "DirectorTransactionLine_directorId_idx" ON "DirectorTransactionLine" ("directorId");

CREATE TABLE IF NOT EXISTS "DirectorReceipt" (
  "id"                 SERIAL PRIMARY KEY,
  "directorId"          INTEGER NOT NULL,
  "transactionBatchId"  INTEGER NOT NULL,
  "primaryTransactionId" INTEGER,
  "receiptReference"    VARCHAR(48) NOT NULL UNIQUE,
  "periodMonth"         VARCHAR(7) NOT NULL,
  "transactionDate"     TIMESTAMP(3) NOT NULL,
  "meta"                JSONB,
  "pdfUrl"              VARCHAR(500),
  "pdfStatus"           "DirectorReceiptPdfStatus" NOT NULL DEFAULT 'PENDING',
  "pdfAttempts"         INTEGER NOT NULL DEFAULT 0,
  "pdfLastError"        VARCHAR(2000),
  "deletedAt"           TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DirectorReceipt_directorId_transactionDate_idx"
  ON "DirectorReceipt" ("directorId","transactionDate");
CREATE INDEX IF NOT EXISTS "DirectorReceipt_transactionBatchId_idx"
  ON "DirectorReceipt" ("transactionBatchId");
CREATE INDEX IF NOT EXISTS "DirectorReceipt_deletedAt_idx"
  ON "DirectorReceipt" ("deletedAt");

-- 4) Distributions and reinstatements
CREATE TABLE IF NOT EXISTS "DirectorCapitalDistribution" (
  "id"                   SERIAL PRIMARY KEY,
  "directorId"            INTEGER NOT NULL,
  "distributionDate"      TIMESTAMP(3) NOT NULL,
  "totalAmount"           DECIMAL(18,2) NOT NULL,
  "currency"              VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "outstandingBalance"    DECIMAL(18,2) NOT NULL,
  "status"                "DirectorCapitalDistributionStatus" NOT NULL DEFAULT 'OPEN',
  "transactionBatchId"    INTEGER,
  "primaryTransactionId"  INTEGER,
  "createdBy"             INTEGER NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DirectorCapitalDistribution_directorId_distributionDate_idx"
  ON "DirectorCapitalDistribution" ("directorId","distributionDate");
CREATE INDEX IF NOT EXISTS "DirectorCapitalDistribution_status_idx"
  ON "DirectorCapitalDistribution" ("status");

CREATE TABLE IF NOT EXISTS "DirectorCapitalReinstatement" (
  "id"                   SERIAL PRIMARY KEY,
  "directorId"            INTEGER NOT NULL,
  "distributionId"        INTEGER NOT NULL,
  "date"                  TIMESTAMP(3) NOT NULL,
  "amount"                DECIMAL(18,2) NOT NULL,
  "currency"              VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "transactionBatchId"    INTEGER,
  "primaryTransactionId"  INTEGER,
  "createdBy"             INTEGER NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DirectorCapitalReinstatement_directorId_date_idx"
  ON "DirectorCapitalReinstatement" ("directorId","date");
CREATE INDEX IF NOT EXISTS "DirectorCapitalReinstatement_distributionId_idx"
  ON "DirectorCapitalReinstatement" ("distributionId");

-- 5) Company loans to director + repayments
CREATE TABLE IF NOT EXISTS "CompanyLoanToDirector" (
  "id"                 SERIAL PRIMARY KEY,
  "directorId"          INTEGER NOT NULL,
  "loanDate"            TIMESTAMP(3) NOT NULL,
  "principalAmount"     DECIMAL(18,2) NOT NULL,
  "currency"            VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "repaymentTerms"      VARCHAR(800) NOT NULL,
  "reason"              VARCHAR(1200),
  "outstandingBalance"  DECIMAL(18,2) NOT NULL,
  "totalInterestPaid"   DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status"              "CompanyLoanToDirectorStatus" NOT NULL DEFAULT 'OPEN',
  "transactionBatchId"  INTEGER,
  "primaryTransactionId" INTEGER,
  "createdBy"           INTEGER NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CompanyLoanToDirector_directorId_loanDate_idx"
  ON "CompanyLoanToDirector" ("directorId","loanDate");
CREATE INDEX IF NOT EXISTS "CompanyLoanToDirector_status_idx"
  ON "CompanyLoanToDirector" ("status");

CREATE TABLE IF NOT EXISTS "CompanyLoanToDirectorRepayment" (
  "id"                 SERIAL PRIMARY KEY,
  "directorId"          INTEGER NOT NULL,
  "loanId"              INTEGER NOT NULL,
  "date"                TIMESTAMP(3) NOT NULL,
  "totalReceived"       DECIMAL(18,2) NOT NULL,
  "principalPaid"       DECIMAL(18,2) NOT NULL,
  "interestPaid"        DECIMAL(18,2) NOT NULL,
  "currency"            VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "transactionBatchId"  INTEGER,
  "primaryTransactionId" INTEGER,
  "createdBy"           INTEGER NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CompanyLoanToDirectorRepayment_directorId_date_idx"
  ON "CompanyLoanToDirectorRepayment" ("directorId","date");
CREATE INDEX IF NOT EXISTS "CompanyLoanToDirectorRepayment_loanId_idx"
  ON "CompanyLoanToDirectorRepayment" ("loanId");

-- 6) Link FKs (safe-add)
ALTER TABLE "DirectorTransactionBatch"
  ADD CONSTRAINT IF NOT EXISTS "DirectorTransactionBatch_directorId_fkey"
  FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectorReceipt"
  ADD CONSTRAINT IF NOT EXISTS "DirectorReceipt_directorId_fkey"
  FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorReceipt"
  ADD CONSTRAINT IF NOT EXISTS "DirectorReceipt_transactionBatchId_fkey"
  FOREIGN KEY ("transactionBatchId") REFERENCES "DirectorTransactionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectorTransactionLine"
  ADD CONSTRAINT IF NOT EXISTS "DirectorTransactionLine_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "DirectorTransactionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectorCapitalDistribution"
  ADD CONSTRAINT IF NOT EXISTS "DirectorCapitalDistribution_directorId_fkey"
  FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectorCapitalReinstatement"
  ADD CONSTRAINT IF NOT EXISTS "DirectorCapitalReinstatement_directorId_fkey"
  FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorCapitalReinstatement"
  ADD CONSTRAINT IF NOT EXISTS "DirectorCapitalReinstatement_distributionId_fkey"
  FOREIGN KEY ("distributionId") REFERENCES "DirectorCapitalDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyLoanToDirector"
  ADD CONSTRAINT IF NOT EXISTS "CompanyLoanToDirector_directorId_fkey"
  FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyLoanToDirectorRepayment"
  ADD CONSTRAINT IF NOT EXISTS "CompanyLoanToDirectorRepayment_directorId_fkey"
  FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyLoanToDirectorRepayment"
  ADD CONSTRAINT IF NOT EXISTS "CompanyLoanToDirectorRepayment_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "CompanyLoanToDirector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) Transaction: add batch FK
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "directorTransactionBatchId" INTEGER;
ALTER TABLE "Transaction"
  ADD CONSTRAINT IF NOT EXISTS "Transaction_directorTransactionBatchId_fkey"
  FOREIGN KEY ("directorTransactionBatchId") REFERENCES "DirectorTransactionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Transaction_directorTransactionBatchId_idx"
  ON "Transaction" ("directorTransactionBatchId");

-- 8) Document register linkage columns
ALTER TABLE "DocumentRegister" ADD COLUMN IF NOT EXISTS "directorId" INTEGER;
ALTER TABLE "DocumentRegister" ADD COLUMN IF NOT EXISTS "transactionId" INTEGER;
ALTER TABLE "DocumentRegister" ADD COLUMN IF NOT EXISTS "receiptReference" VARCHAR(48);
CREATE INDEX IF NOT EXISTS "DocumentRegister_directorId_idx" ON "DocumentRegister" ("directorId");
CREATE INDEX IF NOT EXISTS "DocumentRegister_transactionId_idx" ON "DocumentRegister" ("transactionId");
CREATE INDEX IF NOT EXISTS "DocumentRegister_receiptReference_idx" ON "DocumentRegister" ("receiptReference");

