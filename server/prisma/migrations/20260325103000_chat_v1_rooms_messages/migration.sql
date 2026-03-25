-- ChatRoom
CREATE TABLE "ChatRoom" (
    "id" SERIAL NOT NULL,
    "roomKey" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "title" TEXT,
    "meetingId" INTEGER,
    "projectId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatRoom_roomKey_key" UNIQUE ("roomKey")
);

-- ChatRoomMember
CREATE TABLE "ChatRoomMember" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatRoomMember_roomId_userId_key" ON "ChatRoomMember"("roomId", "userId");
CREATE INDEX "ChatRoomMember_userId_lastReadAt_idx" ON "ChatRoomMember"("userId", "lastReadAt");

-- ChatMessage
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- Foreign keys
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

