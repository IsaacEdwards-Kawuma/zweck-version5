import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { buildDirectorReceiptPdfBuffer } from "./directorReceiptPdf.js";
import { toDirectorPublic } from "./directorVisibility.js";

const receiptUploadRoot = path.join(process.cwd(), "uploads", "director-receipts");
fs.mkdirSync(receiptUploadRoot, { recursive: true });

export type DirectorReceiptPdfJobResult = {
  picked: number;
  generated: number;
  failed: number;
  errors: string[];
};

export async function generateDirectorReceiptPdfNow(receiptId: number): Promise<void> {
  const receipt = await prisma.directorReceipt.findUnique({
    where: { id: receiptId },
    include: { director: true, transactionBatch: true }
  });
  if (!receipt || receipt.deletedAt) return;

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const companyName = settings?.companyName || "Zweck Co. Ltd";

  const postedByUser =
    receipt.transactionBatch.createdBy != null
      ? await prisma.user.findUnique({
          where: { id: receipt.transactionBatch.createdBy },
          select: { email: true, director: { select: { name: true } } }
        })
      : null;
  const postedBy = postedByUser?.director?.name || postedByUser?.email || "System";

  const viewer = { role: "ADMIN" as any, directorId: null as any };
  const directorPublic = toDirectorPublic(receipt.director, viewer);

  const buffer = await buildDirectorReceiptPdfBuffer({
    receipt,
    companyName,
    director: {
      id: receipt.director.id,
      name: receipt.director.name,
      email: directorPublic.email ?? null,
      phone: directorPublic.phone ?? null,
      address: directorPublic.address ?? null
    },
    postedBy
  });

  const safeFile = `director-receipt-${receipt.receiptReference}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${safeFile}.pdf`;
  const abs = path.join(receiptUploadRoot, filename);
  fs.writeFileSync(abs, buffer);
  const publicUrl = `/api/uploads/director-receipts/${filename}`;

  await prisma.directorReceipt.update({
    where: { id: receipt.id },
    data: {
      pdfUrl: publicUrl,
      pdfStatus: "READY",
      pdfAttempts: receipt.pdfAttempts + 1,
      pdfLastError: null
    }
  });

  // Keep the Documents register pointing to the stored PDF when possible.
  await prisma.documentRegister.updateMany({
    where: { receiptReference: receipt.receiptReference },
    data: { url: publicUrl }
  });
}

/**
 * Retry job: generate PDFs for PENDING/FAILED receipts (non-blocking).
 * Intended to be called by cron via `/api/jobs/director-receipts/generate-pdfs`.
 */
export async function runDirectorReceiptPdfRetryJob(options?: {
  limit?: number;
  maxAttempts?: number;
}): Promise<DirectorReceiptPdfJobResult> {
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
  const maxAttempts = Math.max(1, Math.min(20, options?.maxAttempts ?? 5));
  const errors: string[] = [];

  const rows = await prisma.directorReceipt.findMany({
    where: {
      deletedAt: null,
      pdfStatus: { in: ["PENDING", "FAILED"] },
      pdfAttempts: { lt: maxAttempts }
    },
    orderBy: [{ pdfStatus: "asc" }, { updatedAt: "asc" }],
    take: limit,
    select: { id: true }
  });

  let generated = 0;
  let failed = 0;

  for (const r of rows) {
    try {
      await generateDirectorReceiptPdfNow(r.id);
      generated += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`receipt ${r.id}: ${msg}`);
      logger.error(e, `[director-receipts] pdf generation failed (receipt ${r.id})`);
      await prisma.directorReceipt.update({
        where: { id: r.id },
        data: {
          pdfStatus: "FAILED",
          pdfAttempts: { increment: 1 },
          pdfLastError: msg.slice(0, 1900)
        }
      });
    }
  }

  return { picked: rows.length, generated, failed, errors };
}

