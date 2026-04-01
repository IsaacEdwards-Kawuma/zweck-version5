import { Router } from "express";
import { z } from "zod";
import type {
  Prisma,
  ProjectPriority,
  SecretaryTaskApprovalStatus,
  SecretaryTaskRecurrence,
  SecretaryTaskStatus
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();
router.use(requireRole("SECRETARY"));

const STATUS_VALUES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"] as const;
const APPROVAL_VALUES = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"] as const;
const RECURRENCE_VALUES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const taskInclude = {
  assignee: { select: { id: true, email: true, role: true } },
  creator: { select: { id: true, email: true } },
  approver: { select: { id: true, email: true } },
  dependsOn: { select: { id: true, title: true, status: true } }
} satisfies Prisma.SecretaryWorkflowTaskInclude;

async function nextColumnOrder(status: SecretaryTaskStatus): Promise<number> {
  const agg = await prisma.secretaryWorkflowTask.aggregate({
    where: { status },
    _max: { columnOrder: true }
  });
  return (agg._max.columnOrder ?? -1) + 1;
}

/** Walk dependency chain upward; true if newDependsOnId eventually reaches taskId. */
async function wouldCreateDependencyCycle(taskId: number, newDependsOnId: number | null): Promise<boolean> {
  if (newDependsOnId == null) return false;
  if (newDependsOnId === taskId) return true;
  let cur: number | null = newDependsOnId;
  const seen = new Set<number>();
  while (cur != null) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    if (cur === taskId) return true;
    const depRow: { dependsOnTaskId: number | null } | null = await prisma.secretaryWorkflowTask.findUnique({
      where: { id: cur },
      select: { dependsOnTaskId: true }
    });
    cur = depRow?.dependsOnTaskId ?? null;
  }
  return false;
}

const createBodySchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeUserId: z.union([z.number().int().positive(), z.null()]).optional(),
  dependsOnTaskId: z.union([z.number().int().positive(), z.null()]).optional(),
  approvalStatus: z.enum(APPROVAL_VALUES).optional(),
  approverUserId: z.union([z.number().int().positive(), z.null()]).optional(),
  recurrence: z.enum(RECURRENCE_VALUES).optional(),
  recurrenceUntil: z.string().datetime().optional().nullable()
});

const patchBodySchema = createBodySchema.partial().extend({
  status: z.enum(STATUS_VALUES).optional(),
  columnOrder: z.number().int().optional()
});

const moveBodySchema = z.object({
  status: z.enum(STATUS_VALUES)
});

router.get("/assignees", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null, adminBlockedAt: null },
    select: { id: true, email: true, role: true, directorId: true },
    orderBy: { email: "asc" }
  });
  return res.json(users);
});

router.get("/", async (_req, res) => {
  const rows = await prisma.secretaryWorkflowTask.findMany({
    orderBy: [{ status: "asc" }, { columnOrder: "asc" }, { id: "asc" }],
    include: taskInclude
  });
  return res.json(rows);
});

router.post("/", validateBody(createBodySchema), async (req, res) => {
  const uid = req.user!.id;
  const body = req.body as z.infer<typeof createBodySchema>;

  if (body.assigneeUserId != null) {
    const u = await prisma.user.findFirst({
      where: { id: body.assigneeUserId, isActive: true, deletedAt: null, adminBlockedAt: null }
    });
    if (!u) return res.status(400).json(apiError("Assignee not found", "assigneeUserId"));
  }

  if (body.approverUserId != null) {
    const u = await prisma.user.findFirst({
      where: { id: body.approverUserId, isActive: true, deletedAt: null, adminBlockedAt: null }
    });
    if (!u) return res.status(400).json(apiError("Approver not found", "approverUserId"));
  }

  if (body.dependsOnTaskId != null) {
    const dep = await prisma.secretaryWorkflowTask.findUnique({ where: { id: body.dependsOnTaskId } });
    if (!dep) return res.status(400).json(apiError("Dependency task not found", "dependsOnTaskId"));
  }

  let approvalStatus: SecretaryTaskApprovalStatus = body.approvalStatus ?? "NOT_REQUIRED";
  if (approvalStatus === "PENDING" && !body.approverUserId) {
    return res.status(400).json(apiError("Approver required when approval is pending", "approverUserId"));
  }

  const status = (body.status ?? "TODO") as SecretaryTaskStatus;
  const colOrder = await nextColumnOrder(status);

  const row = await prisma.secretaryWorkflowTask.create({
    data: {
      title: body.title,
      description: body.description ?? undefined,
      status,
      priority: (body.priority ?? "MEDIUM") as ProjectPriority,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      assigneeUserId: body.assigneeUserId === null ? null : body.assigneeUserId,
      createdById: uid,
      dependsOnTaskId: body.dependsOnTaskId === null ? null : body.dependsOnTaskId,
      approvalStatus,
      approverUserId: body.approverUserId === null ? null : body.approverUserId,
      recurrence: (body.recurrence ?? "NONE") as SecretaryTaskRecurrence,
      recurrenceUntil: body.recurrenceUntil ? new Date(body.recurrenceUntil) : undefined,
      columnOrder: colOrder
    },
    include: taskInclude
  });

  return res.status(201).json(row);
});

router.patch("/:id/move", validateBody(moveBodySchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const { status: nextStatus } = req.body as z.infer<typeof moveBodySchema>;

  const existing = await prisma.secretaryWorkflowTask.findUnique({ where: { id } });
  if (!existing) return res.status(404).json(apiError("Not found"));

  const columnOrder = await nextColumnOrder(nextStatus as SecretaryTaskStatus);

  const row = await prisma.secretaryWorkflowTask.update({
    where: { id },
    data: { status: nextStatus as SecretaryTaskStatus, columnOrder },
    include: taskInclude
  });
  return res.json(row);
});

router.patch("/:id", validateBody(patchBodySchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  const body = req.body as z.infer<typeof patchBodySchema>;

  const existing = await prisma.secretaryWorkflowTask.findUnique({ where: { id } });
  if (!existing) return res.status(404).json(apiError("Not found"));

  if (body.assigneeUserId !== undefined && body.assigneeUserId !== null) {
    const u = await prisma.user.findFirst({
      where: { id: body.assigneeUserId, isActive: true, deletedAt: null, adminBlockedAt: null }
    });
    if (!u) return res.status(400).json(apiError("Assignee not found", "assigneeUserId"));
  }

  if (body.approverUserId !== undefined && body.approverUserId !== null) {
    const u = await prisma.user.findFirst({
      where: { id: body.approverUserId, isActive: true, deletedAt: null, adminBlockedAt: null }
    });
    if (!u) return res.status(400).json(apiError("Approver not found", "approverUserId"));
  }

  if (body.dependsOnTaskId !== undefined && body.dependsOnTaskId !== null) {
    if (body.dependsOnTaskId === id) return res.status(400).json(apiError("Task cannot depend on itself"));
    const dep = await prisma.secretaryWorkflowTask.findUnique({ where: { id: body.dependsOnTaskId } });
    if (!dep) return res.status(400).json(apiError("Dependency task not found", "dependsOnTaskId"));
    if (await wouldCreateDependencyCycle(id, body.dependsOnTaskId)) {
      return res.status(400).json(apiError("Invalid dependency (cycle)"));
    }
  }

  const data: Prisma.SecretaryWorkflowTaskUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) data.priority = body.priority as ProjectPriority;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.assigneeUserId !== undefined) data.assigneeUserId = body.assigneeUserId;
  if (body.dependsOnTaskId !== undefined) data.dependsOnTaskId = body.dependsOnTaskId;
  if (body.approverUserId !== undefined) data.approverUserId = body.approverUserId;
  if (body.recurrence !== undefined) data.recurrence = body.recurrence as SecretaryTaskRecurrence;
  if (body.recurrenceUntil !== undefined) data.recurrenceUntil = body.recurrenceUntil ? new Date(body.recurrenceUntil) : null;

  if (body.approvalStatus !== undefined) {
    data.approvalStatus = body.approvalStatus as SecretaryTaskApprovalStatus;
    if (body.approvalStatus === "APPROVED" || body.approvalStatus === "REJECTED") {
      data.approvedAt = new Date();
    } else if (body.approvalStatus === "PENDING" || body.approvalStatus === "NOT_REQUIRED") {
      data.approvedAt = null;
    }
  }

  if (body.status !== undefined) {
    const nextStatus = body.status as SecretaryTaskStatus;
    data.status = nextStatus;
    if (body.columnOrder === undefined && nextStatus !== existing.status) {
      data.columnOrder = await nextColumnOrder(nextStatus);
    }
  }
  if (body.columnOrder !== undefined) data.columnOrder = body.columnOrder;

  if (Object.keys(data).length === 0) {
    return res.status(400).json(apiError("No changes"));
  }

  const row = await prisma.secretaryWorkflowTask.update({
    where: { id },
    data,
    include: taskInclude
  });
  return res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid id"));
  try {
    await prisma.secretaryWorkflowTask.delete({ where: { id } });
    return res.status(204).send();
  } catch {
    return res.status(404).json(apiError("Not found"));
  }
});

export default router;
