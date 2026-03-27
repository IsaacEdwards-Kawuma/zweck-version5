-- Add correction linking and reversal reason metadata
ALTER TABLE "Transaction"
ADD COLUMN "correctionOfId" INTEGER,
ADD COLUMN "reversalReason" VARCHAR(500);

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_correctionOfId_fkey"
FOREIGN KEY ("correctionOfId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Transaction_correctionOfId_idx" ON "Transaction"("correctionOfId");
