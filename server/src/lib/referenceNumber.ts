import { prisma } from "./prisma.js";

/** Sequential ZWK-YYYY-MM-XXXX per calendar month (UTC). */
export async function allocateNextReferenceNumber(options?: { reversal?: boolean; correction?: boolean }): Promise<string> {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await prisma.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "ReferenceSequence" ("yearMonth", "lastSeq")
    VALUES (${ym}, 1)
    ON CONFLICT ("yearMonth") DO UPDATE SET "lastSeq" = "ReferenceSequence"."lastSeq" + 1
    RETURNING "lastSeq"
  `;
  const seq = rows[0]?.lastSeq ?? 1;
  const base = `ZWK-${ym}-${String(seq).padStart(4, "0")}`;
  if (options?.reversal) return `${base}-REV`;
  if (options?.correction) return `${base}-COR`;
  return base;
}

/** Next number preview (does not reserve). */
export async function peekNextReferenceNumber(): Promise<string> {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const row = await prisma.referenceSequence.findUnique({ where: { yearMonth: ym } });
  const next = (row?.lastSeq ?? 0) + 1;
  return `ZWK-${ym}-${String(next).padStart(4, "0")}`;
}
