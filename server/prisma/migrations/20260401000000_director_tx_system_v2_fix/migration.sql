-- Fix for 20260331193000_director_tx_system_v2: Postgres does not support
-- `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS ...`. This migration adds the same
-- foreign keys safely using catalog checks.

DO $$
BEGIN
  -- DirectorTransactionBatch.directorId -> Director.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DirectorTransactionBatch_directorId_fkey'
  ) THEN
    ALTER TABLE "DirectorTransactionBatch"
      ADD CONSTRAINT "DirectorTransactionBatch_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- DirectorReceipt.directorId -> Director.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorReceipt_directorId_fkey') THEN
    ALTER TABLE "DirectorReceipt"
      ADD CONSTRAINT "DirectorReceipt_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- DirectorReceipt.transactionBatchId -> DirectorTransactionBatch.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorReceipt_transactionBatchId_fkey') THEN
    ALTER TABLE "DirectorReceipt"
      ADD CONSTRAINT "DirectorReceipt_transactionBatchId_fkey"
      FOREIGN KEY ("transactionBatchId") REFERENCES "DirectorTransactionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- DirectorTransactionLine.batchId -> DirectorTransactionBatch.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorTransactionLine_batchId_fkey') THEN
    ALTER TABLE "DirectorTransactionLine"
      ADD CONSTRAINT "DirectorTransactionLine_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "DirectorTransactionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- DirectorCapitalDistribution.directorId -> Director.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorCapitalDistribution_directorId_fkey') THEN
    ALTER TABLE "DirectorCapitalDistribution"
      ADD CONSTRAINT "DirectorCapitalDistribution_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- DirectorCapitalReinstatement.directorId -> Director.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorCapitalReinstatement_directorId_fkey') THEN
    ALTER TABLE "DirectorCapitalReinstatement"
      ADD CONSTRAINT "DirectorCapitalReinstatement_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- DirectorCapitalReinstatement.distributionId -> DirectorCapitalDistribution.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DirectorCapitalReinstatement_distributionId_fkey') THEN
    ALTER TABLE "DirectorCapitalReinstatement"
      ADD CONSTRAINT "DirectorCapitalReinstatement_distributionId_fkey"
      FOREIGN KEY ("distributionId") REFERENCES "DirectorCapitalDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- CompanyLoanToDirector.directorId -> Director.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyLoanToDirector_directorId_fkey') THEN
    ALTER TABLE "CompanyLoanToDirector"
      ADD CONSTRAINT "CompanyLoanToDirector_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- CompanyLoanToDirectorRepayment.directorId -> Director.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyLoanToDirectorRepayment_directorId_fkey') THEN
    ALTER TABLE "CompanyLoanToDirectorRepayment"
      ADD CONSTRAINT "CompanyLoanToDirectorRepayment_directorId_fkey"
      FOREIGN KEY ("directorId") REFERENCES "Director"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- CompanyLoanToDirectorRepayment.loanId -> CompanyLoanToDirector.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyLoanToDirectorRepayment_loanId_fkey') THEN
    ALTER TABLE "CompanyLoanToDirectorRepayment"
      ADD CONSTRAINT "CompanyLoanToDirectorRepayment_loanId_fkey"
      FOREIGN KEY ("loanId") REFERENCES "CompanyLoanToDirector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- Transaction.directorTransactionBatchId -> DirectorTransactionBatch.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_directorTransactionBatchId_fkey') THEN
    ALTER TABLE "Transaction"
      ADD CONSTRAINT "Transaction_directorTransactionBatchId_fkey"
      FOREIGN KEY ("directorTransactionBatchId") REFERENCES "DirectorTransactionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

