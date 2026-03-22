import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

function jsonField(v: unknown | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  return v as Prisma.InputJsonValue;
}

export async function writeAudit(
  req: Request,
  row: {
    action: string;
    entityType: string;
    entityId?: number | null;
    before?: unknown;
    after?: unknown;
  }
): Promise<void> {
  if (!req.user) return;
  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId ?? null,
      before: jsonField(row.before),
      after: jsonField(row.after)
    }
  });
}
