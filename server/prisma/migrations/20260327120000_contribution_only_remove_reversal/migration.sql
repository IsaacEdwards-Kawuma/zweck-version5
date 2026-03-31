-- Remove reversing entries first (same type as original), then all non-contribution rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Transaction'
      AND column_name = 'reversalOfId'
  ) THEN
    EXECUTE 'DELETE FROM "Transaction" WHERE "reversalOfId" IS NOT NULL';
  END IF;
END
$$;
DELETE FROM "Transaction" WHERE type::text <> 'CONTRIBUTION';

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_reversalOfId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_correctionOfId_fkey";

DROP INDEX IF EXISTS "Transaction_correctionOfId_idx";

ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "reversalOfId";
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "reversalReason";
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "correctionOfId";

-- TxType: only CONTRIBUTION
CREATE TYPE "TxType_new" AS ENUM ('CONTRIBUTION');
ALTER TABLE "Transaction" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Transaction" ALTER COLUMN "type" TYPE "TxType_new" USING ("type"::text::"TxType_new");
DROP TYPE "TxType";
ALTER TYPE "TxType_new" RENAME TO "TxType";

-- Posting status: drop REVERSED
UPDATE "Transaction" SET "postingStatus" = 'POSTED' WHERE "postingStatus"::text = 'REVERSED';

CREATE TYPE "TransactionPostingStatus_new" AS ENUM ('POSTED', 'PENDING');
ALTER TABLE "Transaction" ALTER COLUMN "postingStatus" DROP DEFAULT;
ALTER TABLE "Transaction" ALTER COLUMN "postingStatus" TYPE "TransactionPostingStatus_new" USING (
  CASE
    WHEN "postingStatus"::text IN ('POSTED', 'PENDING') THEN "postingStatus"::text::"TransactionPostingStatus_new"
    ELSE 'POSTED'::"TransactionPostingStatus_new"
  END
);
DROP TYPE "TransactionPostingStatus";
ALTER TYPE "TransactionPostingStatus_new" RENAME TO "TransactionPostingStatus";
ALTER TABLE "Transaction" ALTER COLUMN "postingStatus" SET DEFAULT 'POSTED'::"TransactionPostingStatus";
