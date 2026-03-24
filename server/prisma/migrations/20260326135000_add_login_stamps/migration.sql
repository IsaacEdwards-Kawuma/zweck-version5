-- Add last login stamp to users
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Login history events
CREATE TABLE IF NOT EXISTS "LoginEvent" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LoginEvent_userId_fkey'
  ) THEN
    ALTER TABLE "LoginEvent"
    ADD CONSTRAINT "LoginEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
