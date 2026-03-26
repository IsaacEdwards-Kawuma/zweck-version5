-- Chat: threads, forwards, mentions, link previews, room slow mode, member notification prefs

ALTER TABLE "ChatRoom" ADD COLUMN IF NOT EXISTS "slowModeSeconds" INTEGER;
ALTER TABLE "ChatRoom" ADD COLUMN IF NOT EXISTS "adminOnlyPost" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChatRoomMember" ADD COLUMN IF NOT EXISTS "mutedUntil" TIMESTAMP(3);
ALTER TABLE "ChatRoomMember" ADD COLUMN IF NOT EXISTS "notifyPreference" VARCHAR(16) NOT NULL DEFAULT 'ALL';

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "threadRootId" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "mentionedUserIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "linkPreview" JSONB;

DO $$ BEGIN
 ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadRootId_fkey" FOREIGN KEY ("threadRootId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_forwardedFromId_fkey" FOREIGN KEY ("forwardedFromId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ChatMessage_threadRootId_idx" ON "ChatMessage"("threadRootId");
