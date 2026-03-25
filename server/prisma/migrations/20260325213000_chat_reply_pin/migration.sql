-- Chat: reply threading + optional pinned message per room

ALTER TABLE "ChatMessage" ADD COLUMN "replyToId" INTEGER;

CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatRoom" ADD COLUMN "pinnedMessageId" INTEGER;

CREATE UNIQUE INDEX "ChatRoom_pinnedMessageId_key" ON "ChatRoom"("pinnedMessageId");

ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_pinnedMessageId_fkey" FOREIGN KEY ("pinnedMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
