-- Editable About page content (singleton id = 1)
CREATE TABLE IF NOT EXISTS "AboutPage" (
    "id" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AboutPage_pkey" PRIMARY KEY ("id")
);
