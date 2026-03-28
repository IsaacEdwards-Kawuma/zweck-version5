-- Remove chat public-key column (DM E2EE removed).
ALTER TABLE "User" DROP COLUMN IF EXISTS "chatPublicKeyJwk";
