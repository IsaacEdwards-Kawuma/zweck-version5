-- User presence (heartbeat-based online/offline)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "presenceSessionStartedAt" TIMESTAMP(3);
