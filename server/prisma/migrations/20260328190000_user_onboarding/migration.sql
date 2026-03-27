-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Existing accounts: treat as already onboarded so current users are not interrupted.
UPDATE "User" SET "onboardingCompletedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP) WHERE "onboardingCompletedAt" IS NULL;
