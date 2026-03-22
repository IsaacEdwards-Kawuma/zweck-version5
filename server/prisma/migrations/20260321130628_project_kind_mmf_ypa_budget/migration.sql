-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('GENERAL', 'MMF', 'YPA');

-- AlterTable
ALTER TABLE "MMFEntry" ADD COLUMN     "projectId" INTEGER;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetCurrency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "budgetSpent" DOUBLE PRECISION,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "leaderDirectorId" INTEGER,
ADD COLUMN     "projectKind" "ProjectKind" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "actualCost" DOUBLE PRECISION,
ADD COLUMN     "estimatedCost" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leaderDirectorId_fkey" FOREIGN KEY ("leaderDirectorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MMFEntry" ADD CONSTRAINT "MMFEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
