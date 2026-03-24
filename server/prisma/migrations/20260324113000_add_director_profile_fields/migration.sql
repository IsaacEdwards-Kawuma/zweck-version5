-- Add richer profile fields for director records.
ALTER TABLE "Director"
ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "idNumber" TEXT,
ADD COLUMN IF NOT EXISTS "occupation" TEXT,
ADD COLUMN IF NOT EXISTS "address" TEXT,
ADD COLUMN IF NOT EXISTS "nextOfKinName" TEXT,
ADD COLUMN IF NOT EXISTS "nextOfKinPhone" TEXT,
ADD COLUMN IF NOT EXISTS "notes" TEXT;

