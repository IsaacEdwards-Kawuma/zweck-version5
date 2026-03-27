-- Global preference: only create chat bell notifications when @mentioned
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inAppChatMentionsOnly" BOOLEAN NOT NULL DEFAULT false;
