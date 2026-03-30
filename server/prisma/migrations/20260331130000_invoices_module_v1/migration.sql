-- Invoicing module (Client/Party, Invoice, LineItems, Payments)

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PartyType') THEN
    CREATE TYPE "PartyType" AS ENUM ('CLIENT', 'DIRECTOR', 'PROJECT_PARTY');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceType') THEN
    CREATE TYPE "InvoiceType" AS ENUM ('SALES', 'PURCHASE', 'PROFORMA', 'CREDIT_NOTE');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceStatus') THEN
    CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'APPROVED');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceCurrency') THEN
    CREATE TYPE "InvoiceCurrency" AS ENUM ('UGX', 'USD', 'EUR');
  END IF;
END $$;

-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceGlStatus') THEN
    CREATE TYPE "InvoiceGlStatus" AS ENUM ('NOT_POSTED', 'POSTED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Client" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "type" "PartyType" NOT NULL,
  "email" VARCHAR(200),
  "phone" VARCHAR(50),
  "address" VARCHAR(500),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "notes" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Client_isDeleted_type_idx" ON "Client"("isDeleted", "type");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" SERIAL NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceType" "InvoiceType" NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "invoiceDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "partyId" INTEGER NOT NULL,
  "currency" "InvoiceCurrency" NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balanceDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentTerms" TEXT NOT NULL,
  "notes" TEXT,
  "linkedProjectId" INTEGER,
  "linkedDirectorId" INTEGER,
  "documentUrl" VARCHAR(500),
  "glStatus" "InvoiceGlStatus" NOT NULL DEFAULT 'NOT_POSTED',
  "voidReason" VARCHAR(500),
  "reversalOfId" INTEGER,
  "creditNoteForId" INTEGER,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique)
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_linkedDirectorId_fkey" FOREIGN KEY ("linkedDirectorId") REFERENCES "Director"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (self-relations)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_creditNoteForId_fkey" FOREIGN KEY ("creditNoteForId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceLineItem" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "taxRate" DOUBLE PRECISION NOT NULL,
  "taxAmount" DOUBLE PRECISION NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoicePayment" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" "InvoiceCurrency" NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "glStatus" "InvoiceGlStatus" NOT NULL DEFAULT 'NOT_POSTED',
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceReferenceSequence" (
  "invoiceType" "InvoiceType" NOT NULL,
  "yearMonth" VARCHAR(7) NOT NULL,
  "lastSeq" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceReferenceSequence_pkey" PRIMARY KEY ("invoiceType", "yearMonth")
);

-- Link GL transactions to invoices
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "invoiceId" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "invoicePaymentId" INTEGER;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_invoicePaymentId_fkey" FOREIGN KEY ("invoicePaymentId") REFERENCES "InvoicePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

