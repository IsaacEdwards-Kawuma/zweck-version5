import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const avatarDir = path.join(process.cwd(), "uploads", "avatars");

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

export function isS3AvatarStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_BUCKET?.trim() &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID) &&
      (process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY) &&
      process.env.S3_PUBLIC_BASE_URL?.trim()
  );
}

export async function saveDirectorAvatar(opts: {
  directorId: number;
  buffer: Buffer;
  ext: string;
  contentType: string;
}): Promise<{ publicUrl: string }> {
  const filename = `d${opts.directorId}-${crypto.randomBytes(8).toString("hex")}${opts.ext}`;
  const key = `avatars/${filename}`;
  const client = buildS3Client();
  const bucket = process.env.S3_BUCKET?.trim();
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim();

  if (client && bucket && publicBase) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: opts.buffer,
        ContentType: opts.contentType || "application/octet-stream"
      })
    );
    const base = publicBase.replace(/\/$/, "");
    return { publicUrl: `${base}/${key}` };
  }

  await fs.mkdir(avatarDir, { recursive: true });
  const diskPath = path.join(avatarDir, filename);
  await fs.writeFile(diskPath, opts.buffer);
  return { publicUrl: `/api/uploads/avatars/${filename}` };
}

/** Remove a previously stored avatar (local disk path or S3 public URL). */
export async function deleteDirectorAvatar(avatarUrl: string | null | undefined): Promise<void> {
  if (!avatarUrl) return;

  if (avatarUrl.startsWith("/api/uploads/")) {
    const rel = avatarUrl.slice("/api/uploads/".length);
    if (rel.includes("..") || path.isAbsolute(rel)) return;
    const full = path.join(process.cwd(), "uploads", rel);
    try {
      await fs.unlink(full);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!/^https?:\/\//i.test(avatarUrl)) return;

  const client = buildS3Client();
  const bucket = process.env.S3_BUCKET?.trim();
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (!client || !bucket || !publicBase) return;

  const base = publicBase.replace(/\/$/, "");
  if (!avatarUrl.startsWith(`${base}/`)) return;
  const key = avatarUrl.slice(base.length + 1);
  if (!key || key.includes("..")) return;

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    /* ignore */
  }
}
