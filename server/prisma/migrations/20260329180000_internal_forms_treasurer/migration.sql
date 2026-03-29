-- Treasurer role + internal forms (requisitions & general requests)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TREASURER';

CREATE TYPE "InternalFormKind" AS ENUM ('REQUISITION', 'GENERAL_REQUEST');

CREATE TYPE "InternalFormStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "internal_forms" (
    "id" SERIAL NOT NULL,
    "kind" "InternalFormKind" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2),
    "currency" VARCHAR(3),
    "purpose" VARCHAR(500),
    "vendor" VARCHAR(200),
    "status" "InternalFormStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "reviewNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_forms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "internal_forms_status_createdAt_idx" ON "internal_forms"("status", "createdAt");
CREATE INDEX "internal_forms_requestedById_idx" ON "internal_forms"("requestedById");
CREATE INDEX "internal_forms_kind_idx" ON "internal_forms"("kind");

ALTER TABLE "internal_forms" ADD CONSTRAINT "internal_forms_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_forms" ADD CONSTRAINT "internal_forms_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
