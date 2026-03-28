-- Optional explicit debit/credit GL keys (overrides type-based TX_ACCOUNT_MAP when both set).
ALTER TABLE "Transaction" ADD COLUMN "manualDebitAccountKey" VARCHAR(48);
ALTER TABLE "Transaction" ADD COLUMN "manualCreditAccountKey" VARCHAR(48);
