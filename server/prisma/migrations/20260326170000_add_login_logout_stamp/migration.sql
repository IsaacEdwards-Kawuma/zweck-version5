-- Exact session duration support via logout stamp
ALTER TABLE "LoginEvent"
ADD COLUMN IF NOT EXISTS "logoutAt" TIMESTAMP(3);
