-- Rename existing receipt table to legacy, then create the new spec `DirectorReceipt`.
-- Also remove the transitional v2 table if it exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'director_receipts_v2'
  ) THEN
    DROP TABLE "director_receipts_v2";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'DirectorReceipt'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'DirectorReceiptLegacy'
  ) THEN
    ALTER TABLE "DirectorReceipt" RENAME TO "DirectorReceiptLegacy";
  END IF;
END
$$;

-- Create new `DirectorReceipt` (spec table)
CREATE TABLE IF NOT EXISTS "DirectorReceipt" (
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
  CONSTRAINT "DirectorReceipt_new_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DirectorReceipt_new_referenceNumber_key"
  ON "DirectorReceipt"("referenceNumber");

CREATE INDEX IF NOT EXISTS "DirectorReceipt_new_directorId_transactionDate_idx"
  ON "DirectorReceipt"("directorId", "transactionDate");
CREATE INDEX IF NOT EXISTS "DirectorReceipt_new_transactionId_idx"
  ON "DirectorReceipt"("transactionId");
CREATE INDEX IF NOT EXISTS "DirectorReceipt_new_periodMonth_idx"
  ON "DirectorReceipt"("periodMonth");
CREATE INDEX IF NOT EXISTS "DirectorReceipt_new_transactionType_idx"
  ON "DirectorReceipt"("transactionType");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorReceipt_directorId_fkey') THEN
    ALTER TABLE "DirectorReceipt"
      ADD CONSTRAINT "DirectorReceipt_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorReceipt_transactionId_fkey') THEN
    ALTER TABLE "DirectorReceipt"
      ADD CONSTRAINT "DirectorReceipt_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
