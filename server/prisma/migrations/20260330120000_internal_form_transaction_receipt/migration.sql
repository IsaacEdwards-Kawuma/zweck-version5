-- AlterEnum
ALTER TYPE "InternalFormKind" ADD VALUE IF NOT EXISTS 'TRANSACTION_RECEIPT';

-- AlterTable
ALTER TABLE "internal_forms" ADD COLUMN IF NOT EXISTS "receipt_url" VARCHAR(500);
ALTER TABLE "internal_forms" ADD COLUMN IF NOT EXISTS "receipt_file_name" VARCHAR(255);
