-- Chat v2: preferences, group creator, attachments, reactions

ALTER TABLE "User" ADD COLUMN "inAppChatMessages" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ChatRoom" ADD COLUMN "createdById" INTEGER;
CREATE INDEX "ChatRoom_createdById_idx" ON "ChatRoom"("createdById");
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD COLUMN "attachmentUrl" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentKind" VARCHAR(16);
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentName" VARCHAR(255);
ALTER TABLE "ChatMessage" ADD COLUMN "attachmentSize" INTEGER;

CREATE TABLE "ChatMessageReaction" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageReaction_messageId_userId_emoji_key" ON "ChatMessageReaction"("messageId", "userId", "emoji");
CREATE INDEX "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId");

ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
