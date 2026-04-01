-- CreateEnum
CREATE TYPE "SecretaryTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SecretaryTaskApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SecretaryTaskRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "SecretaryWorkflowTask" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "status" "SecretaryTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "ProjectPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assigneeUserId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "dependsOnTaskId" INTEGER,
    "approvalStatus" "SecretaryTaskApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approverUserId" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "recurrence" "SecretaryTaskRecurrence" NOT NULL DEFAULT 'NONE',
    "recurrenceUntil" TIMESTAMP(3),
    "columnOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecretaryWorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecretaryWorkflowTask_status_columnOrder_idx" ON "SecretaryWorkflowTask"("status", "columnOrder");

-- CreateIndex
CREATE INDEX "SecretaryWorkflowTask_assigneeUserId_idx" ON "SecretaryWorkflowTask"("assigneeUserId");

-- CreateIndex
CREATE INDEX "SecretaryWorkflowTask_dueDate_idx" ON "SecretaryWorkflowTask"("dueDate");

-- AddForeignKey
ALTER TABLE "SecretaryWorkflowTask" ADD CONSTRAINT "SecretaryWorkflowTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretaryWorkflowTask" ADD CONSTRAINT "SecretaryWorkflowTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretaryWorkflowTask" ADD CONSTRAINT "SecretaryWorkflowTask_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "SecretaryWorkflowTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretaryWorkflowTask" ADD CONSTRAINT "SecretaryWorkflowTask_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
