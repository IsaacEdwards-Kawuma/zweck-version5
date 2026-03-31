import { prisma } from "./prisma.js";
import { ymFromDateUtc } from "./directorPosting.js";

const PREFIX_BY_TYPE_KEY: Record<string, string> = {
  CCR: "CCR", // capital contribution receipt (monthly, arrears, supplementary, reinstatement)
  WDR: "WDR",
  FNE: "FNE",
  FEE: "FEE",
  DLN: "DLN",
  DLR: "DLR",
  CLN: "CLN",
  CLR: "CLR"
};

export function typeKeyForReceiptPrefix(prefix: string): string {
  const p = String(prefix || "").toUpperCase().trim();
  if (!PREFIX_BY_TYPE_KEY[p]) throw new Error(`Unknown receipt prefix: ${p}`);
  return p;
}

export async function allocateNextDirectorReceiptReference(options: {
  prefix: keyof typeof PREFIX_BY_TYPE_KEY;
  date: Date;
}): Promise<string> {
  const ym = ymFromDateUtc(options.date);
  const typeKey = typeKeyForReceiptPrefix(options.prefix);
  const rows = await prisma.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "DirectorReferenceSequence" ("yearMonth", "typeKey", "lastSeq")
    VALUES (${ym}, ${typeKey}, 1)
    ON CONFLICT ("yearMonth","typeKey") DO UPDATE SET "lastSeq" = "DirectorReferenceSequence"."lastSeq" + 1
    RETURNING "lastSeq"
  `;
  const seq = rows[0]?.lastSeq ?? 1;
  return `ZWK-${typeKey}-${ym}-${String(seq).padStart(4, "0")}`;
}

