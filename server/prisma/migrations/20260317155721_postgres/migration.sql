-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DIRECTOR');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('CONTRIBUTION', 'SIDE_FUND', 'MMF_DEPLOY', 'MMF_RETURN', 'YPA_INVEST', 'REGISTRATION', 'TX_CHARGE', 'LEGAL', 'PENALTY', 'LOAN_IN', 'OTHER_OUT');

-- CreateTable
CREATE TABLE "Director" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "initials" VARCHAR(3) NOT NULL,
    "email" TEXT NOT NULL,
    "joinedRound" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Director_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'DIRECTOR',
    "directorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "type" "TxType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "directorId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MMFEntry" (
    "id" SERIAL NOT NULL,
    "directorId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "interest" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "accountType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MMFEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CirculationRound" (
    "id" SERIAL NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "amountPerMember" DOUBLE PRECISION NOT NULL,
    "totalCollected" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "CirculationRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Director_email_key" ON "Director"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_directorId_key" ON "User"("directorId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;
