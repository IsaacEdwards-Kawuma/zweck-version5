-- Block 1 — Database Foundation + First Two Transaction Types (schema only)

DO $$ BEGIN
  CREATE TYPE "DirectorDistributionStatus" AS ENUM ('OPEN', 'PARTIALLY_REINSTATED', 'FULLY_REINSTATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DirectorCompanyLoanStatus" AS ENUM ('OPEN', 'PARTIALLY_REPAID', 'FULLY_REPAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DirectorDistribution" (
  "id" SERIAL NOT NULL,
  "directorId" INTEGER NOT NULL,
  "transactionId" INTEGER NOT NULL,
  "distributionDate" TIMESTAMP(3) NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "outstandingBalance" DECIMAL(18,2) NOT NULL,
  "status" "DirectorDistributionStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER NOT NULL,
  CONSTRAINT "DirectorDistribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DirectorCompanyLoan" (
  "id" SERIAL NOT NULL,
  "directorId" INTEGER NOT NULL,
  "transactionId" INTEGER NOT NULL,
  "loanDate" TIMESTAMP(3) NOT NULL,
  "principalAmount" DECIMAL(18,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "repaymentTerms" VARCHAR(800) NOT NULL,
  "outstandingBalance" DECIMAL(18,2) NOT NULL,
  "totalInterestPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" "DirectorCompanyLoanStatus" NOT NULL DEFAULT 'OPEN',
  "reason" VARCHAR(1200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER NOT NULL,
  CONSTRAINT "DirectorCompanyLoan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DirectorLoanRepayment" (
  "id" SERIAL NOT NULL,
  "loanId" INTEGER NOT NULL,
  "transactionId" INTEGER NOT NULL,
  "repaymentDate" TIMESTAMP(3) NOT NULL,
  "totalReceived" DECIMAL(18,2) NOT NULL,
  "principalAmount" DECIMAL(18,2) NOT NULL,
  "interestAmount" DECIMAL(18,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER NOT NULL,
  CONSTRAINT "DirectorLoanRepayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "director_receipts_v2" (
  "id" SERIAL NOT NULL,
  "referenceNumber" VARCHAR(48) NOT NULL,
  "transactionType" VARCHAR(32) NOT NULL,
  "directorId" INTEGER NOT NULL,
  "transactionId" INTEGER NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "periodMonth" VARCHAR(7) NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "capitalAmount" DECIMAL(18,2),
  "sideFundAmount" DECIMAL(18,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "glReference" VARCHAR(80),
  "additionalData" JSONB,
  "pdfUrl" VARCHAR(500),
  "isViewed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER NOT NULL,
  CONSTRAINT "director_receipts_v2_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "director_receipts_v2_referenceNumber_key"
  ON "director_receipts_v2"("referenceNumber");

CREATE INDEX IF NOT EXISTS "DirectorDistribution_directorId_distributionDate_idx"
  ON "DirectorDistribution"("directorId", "distributionDate");
CREATE INDEX IF NOT EXISTS "DirectorDistribution_transactionId_idx"
  ON "DirectorDistribution"("transactionId");
CREATE INDEX IF NOT EXISTS "DirectorDistribution_status_idx"
  ON "DirectorDistribution"("status");

CREATE INDEX IF NOT EXISTS "DirectorCompanyLoan_directorId_loanDate_idx"
  ON "DirectorCompanyLoan"("directorId", "loanDate");
CREATE INDEX IF NOT EXISTS "DirectorCompanyLoan_transactionId_idx"
  ON "DirectorCompanyLoan"("transactionId");
CREATE INDEX IF NOT EXISTS "DirectorCompanyLoan_status_idx"
  ON "DirectorCompanyLoan"("status");

CREATE INDEX IF NOT EXISTS "DirectorLoanRepayment_loanId_repaymentDate_idx"
  ON "DirectorLoanRepayment"("loanId", "repaymentDate");
CREATE INDEX IF NOT EXISTS "DirectorLoanRepayment_transactionId_idx"
  ON "DirectorLoanRepayment"("transactionId");

CREATE INDEX IF NOT EXISTS "director_receipts_v2_directorId_transactionDate_idx"
  ON "director_receipts_v2"("directorId", "transactionDate");
CREATE INDEX IF NOT EXISTS "director_receipts_v2_transactionId_idx"
  ON "director_receipts_v2"("transactionId");
CREATE INDEX IF NOT EXISTS "director_receipts_v2_periodMonth_idx"
  ON "director_receipts_v2"("periodMonth");
CREATE INDEX IF NOT EXISTS "director_receipts_v2_transactionType_idx"
  ON "director_receipts_v2"("transactionType");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorDistribution_directorId_fkey') THEN
    ALTER TABLE "DirectorDistribution"
      ADD CONSTRAINT "DirectorDistribution_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorDistribution_transactionId_fkey') THEN
    ALTER TABLE "DirectorDistribution"
      ADD CONSTRAINT "DirectorDistribution_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorCompanyLoan_directorId_fkey') THEN
    ALTER TABLE "DirectorCompanyLoan"
      ADD CONSTRAINT "DirectorCompanyLoan_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorCompanyLoan_transactionId_fkey') THEN
    ALTER TABLE "DirectorCompanyLoan"
      ADD CONSTRAINT "DirectorCompanyLoan_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorLoanRepayment_loanId_fkey') THEN
    ALTER TABLE "DirectorLoanRepayment"
      ADD CONSTRAINT "DirectorLoanRepayment_loanId_fkey"
      FOREIGN KEY ("loanId") REFERENCES "DirectorCompanyLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorLoanRepayment_transactionId_fkey') THEN
    ALTER TABLE "DirectorLoanRepayment"
      ADD CONSTRAINT "DirectorLoanRepayment_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'director_receipts_v2_directorId_fkey') THEN
    ALTER TABLE "director_receipts_v2"
      ADD CONSTRAINT "director_receipts_v2_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'director_receipts_v2_transactionId_fkey') THEN
    ALTER TABLE "director_receipts_v2"
      ADD CONSTRAINT "director_receipts_v2_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
