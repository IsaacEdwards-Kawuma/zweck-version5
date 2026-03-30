-- Store selected revenue/expense GL account keys per invoice

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "glRevenueAccountKey" VARCHAR(48);

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "glExpenseAccountKey" VARCHAR(48);

