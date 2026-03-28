-- Reversal support: status REVERSED, reversal link fields
DO $$ BEGIN
  ALTER TYPE "TransactionPostingStatus" ADD VALUE 'REVERSED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reversalOfId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reversedByTransactionId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reversalReason" VARCHAR(500);

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_reversedByTransactionId_key" ON "Transaction"("reversedByTransactionId");

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_reversalOfId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_reversedByTransactionId_fkey";
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversedByTransactionId_fkey"
  FOREIGN KEY ("reversedByTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
