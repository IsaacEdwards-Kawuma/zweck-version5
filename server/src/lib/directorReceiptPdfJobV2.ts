import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { buildDirectorReceiptPdfV2Buffer } from "./directorReceiptPdfV2.js";

const receiptUploadRoot = path.join(process.cwd(), "uploads", "director-receipts-v2");
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

export async function generateDirectorReceiptPdfNowV2(receiptId: number): Promise<void> {
  const receipt = await prisma.directorReceipt.findUnique({
    where: { id: receiptId },
    include: { director: true }
  });
  if (!receipt) return;

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const companyName = settings?.companyName || "Zweck Co. Ltd";

  const createdByUser =
    receipt.createdBy != null
      ? await prisma.user.findUnique({
          where: { id: receipt.createdBy },
          select: { email: true, director: { select: { name: true } } }
        })
      : null;
  const sessionUsername = createdByUser?.director?.name || createdByUser?.email || "System";

  const buffer = await buildDirectorReceiptPdfV2Buffer({
    companyName,
    receipt,
    postedBy: sessionUsername,
    sessionUsername
  });

  const safeBase = `director-receipt-${receipt.referenceNumber}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${safeBase}.pdf`;

  let publicUrl = `/api/uploads/director-receipts-v2/${filename}`;

  if (isS3ReceiptStorageConfigured()) {
    const client = buildS3Client();
    const bucket = process.env.S3_BUCKET!.trim();
    const publicBase = process.env.S3_PUBLIC_BASE_URL!.trim().replace(/\/$/, "");
    if (client) {
      const key = `director-receipts-v2/${safeBase}-${crypto.randomBytes(8).toString("hex")}.pdf`;
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
    data: { pdfUrl: publicUrl }
  });

  // Ensure the receipt is searchable/downloadable from Documents module.
  // We create the register row at PDF creation time so `url` points to the stored file (local/S3).
  const existing = await prisma.documentRegister.findFirst({
    where: { receiptReference: receipt.referenceNumber }
  });
  const docData = {
    title: `Director Transaction Receipt — ${receipt.referenceNumber}`,
    category: "Director Transaction Receipt",
    reference: receipt.glReference || receipt.referenceNumber,
    owner: "Finance",
    confidentiality: "Internal",
    status: "ACTIVE",
    url: publicUrl,
    directorId: receipt.directorId,
    transactionId: receipt.transactionId,
    receiptReference: receipt.referenceNumber,
    createdById: receipt.createdBy,
    updatedById: receipt.createdBy
  };
  if (existing) {
    await prisma.documentRegister.update({ where: { id: existing.id }, data: docData });
  } else {
    await prisma.documentRegister.create({ data: docData });
  }
}

export async function generateDirectorReceiptPdfForReferenceV2(referenceNumber: string): Promise<void> {
  const row = await prisma.directorReceipt.findUnique({ where: { referenceNumber }, select: { id: true } });
  if (!row) return;
  await generateDirectorReceiptPdfNowV2(row.id);
}

export async function runDirectorReceiptPdfBackfillV2(options?: { limit?: number }): Promise<{ picked: number }> {
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
  const rows = await prisma.directorReceipt.findMany({
    where: { pdfUrl: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true }
  });
  for (const r of rows) {
    try {
      await generateDirectorReceiptPdfNowV2(r.id);
    } catch (e) {
      logger.error(e, `[director-receipts-v2] pdf generation failed (receipt ${r.id})`);
    }
  }
  return { picked: rows.length };
}

