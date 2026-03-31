import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { buildDirectorReceiptPdfBuffer } from "./directorReceiptPdf.js";
import { toDirectorPublic } from "./directorVisibility.js";

const receiptUploadRoot = path.join(process.cwd(), "uploads", "director-receipts");
fs.mkdirSync(receiptUploadRoot, { recursive: true });

function buildS3Client(): S3Client | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_REGION?.trim() || process.env.S3_REGION?.trim() || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region,
    endpoint: endpoint || undefined,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint)
  });
}

function isS3ReceiptStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_BUCKET?.trim() &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID) &&
      (process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY) &&
      process.env.S3_PUBLIC_BASE_URL?.trim()
  );
}

export type DirectorReceiptPdfJobResult = {
  picked: number;
  generated: number;
  failed: number;
  errors: string[];
};

export async function generateDirectorReceiptPdfNow(receiptId: number): Promise<void> {
  const receipt = await prisma.directorReceipt.findUnique({
    where: { id: receiptId },
    include: {
      director: true,
      transactionBatch: {
        include: {
          transactions: { orderBy: { id: "asc" } },
          lines: { orderBy: { id: "asc" } }
        }
      }
    }
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
    transactionBatch: receipt.transactionBatch,
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

  const safeBase = `director-receipt-${receipt.receiptReference}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${safeBase}.pdf`;

  let publicUrl = `/api/uploads/director-receipts/${filename}`;
  if (isS3ReceiptStorageConfigured()) {
    const client = buildS3Client();
    const bucket = process.env.S3_BUCKET!.trim();
    const publicBase = process.env.S3_PUBLIC_BASE_URL!.trim().replace(/\/$/, "");
    if (client) {
      const key = `director-receipts/${safeBase}-${crypto.randomBytes(8).toString("hex")}.pdf`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: "application/pdf"
        })
      );
      publicUrl = `${publicBase}/${key}`;
    } else {
      const abs = path.join(receiptUploadRoot, filename);
      fs.writeFileSync(abs, buffer);
    }
  } else {
    const abs = path.join(receiptUploadRoot, filename);
    fs.writeFileSync(abs, buffer);
  }

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

