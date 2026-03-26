import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { apiError } from "../lib/http.js";

const router = Router();

const MAX_JSON = 500;
const MAX_CSV = 5000;

function parseQueryDate(value: unknown, label: string): Date | undefined {
  if (value == null || String(value).trim() === "") return undefined;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${label}`);
  }
  return d;
}

function buildWhere(q: Record<string, unknown>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const createdAt: Prisma.DateTimeFilter = {};
  try {
    const from = parseQueryDate(q.from, "from");
    const to = parseQueryDate(q.to, "to");
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
  } catch (e) {
    throw e;
  }
  if (Object.keys(createdAt).length) where.createdAt = createdAt;

  if (q.userId != null && String(q.userId).trim() !== "") {
    const uid = Number(q.userId);
    if (!Number.isFinite(uid) || uid < 1) throw new Error("userId must be a positive integer");
    where.userId = uid;
  }
  if (q.entityType != null && String(q.entityType).trim() !== "") {
    where.entityType = String(q.entityType).trim();
  }
  if (q.action != null && String(q.action).trim() !== "") {
    where.action = { contains: String(q.action).trim(), mode: "insensitive" };
  }
  return where;
}

function csvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

function auditRowsToCsv(rows: Awaited<ReturnType<typeof prisma.auditLog.findMany>>): string {
  const headers = ["id", "createdAt", "userId", "action", "entityType", "entityId", "before", "after"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        csvCell(String(r.id)),
        csvCell(r.createdAt.toISOString()),
        csvCell(String(r.userId)),
        csvCell(r.action),
        csvCell(r.entityType),
        csvCell(r.entityId == null ? "" : String(r.entityId)),
        csvCell(r.before == null ? "" : JSON.stringify(r.before)),
        csvCell(r.after == null ? "" : JSON.stringify(r.after))
      ].join(",")
    )
  ];
  return "\uFEFF" + lines.join("\r\n");
}

router.get("/", requireRole("ADMIN"), async (req, res) => {
  const format = String(req.query.format || "")
    .trim()
    .toLowerCase();
  const isCsv = format === "csv";

  let where: Prisma.AuditLogWhereInput;
  try {
    where = buildWhere(req.query as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid query";
    return res.status(400).json(apiError(msg));
  }

  const cap = isCsv ? MAX_CSV : MAX_JSON;
  const limit = Math.min(cap, Math.max(1, Number(req.query.limit) || (isCsv ? MAX_CSV : 200)));

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit
  });

  if (isCsv) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(auditRowsToCsv(rows));
  }

  return res.json(rows);
});

export default router;
