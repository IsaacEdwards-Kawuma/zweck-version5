import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const projectStatus = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);
const projectKind = z.enum(["GENERAL", "MMF", "YPA"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const taskStatus = z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "BLOCKED"]);

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  status: projectStatus.optional(),
  priority: priority.optional(),
  projectKind: projectKind.optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  budgetSpent: z.number().nonnegative().optional().nullable(),
  budgetCurrency: z.string().min(1).max(8).optional(),
  leaderDirectorId: z.union([z.number().int().positive(), z.null()]).optional(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable()
});

const updateProjectSchema = createProjectSchema.partial();

const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  status: taskStatus.optional(),
  priority: priority.optional(),
  dueDate: z.string().datetime().optional().nullable(),
  assigneeDirectorId: z.union([z.number().int().positive(), z.null()]).optional(),
  sortOrder: z.number().int().optional(),
  estimatedCost: z.number().nonnegative().optional().nullable(),
  actualCost: z.number().nonnegative().optional().nullable()
});

const updateTaskSchema = createTaskSchema.partial();

function leaderSelect() {
  return { select: { id: true, name: true, initials: true, email: true, avatarUrl: true } } as const;
}

function projectSelect() {
  return {
    id: true,
    code: true,
    name: true,
    description: true,
    status: true,
    priority: true,
    projectKind: true,
    startDate: true,
    endDate: true,
    budget: true,
    budgetSpent: true,
    budgetCurrency: true,
    leaderDirectorId: true,
    leaderDirector: leaderSelect(),
    contactName: true,
    contactEmail: true,
    contactPhone: true,
    createdById: true,
    createdAt: true,
    updatedAt: true,
    creator: { select: { id: true, email: true } },
    tasks: {
      select: {
        id: true,
        status: true,
        actualCost: true
      }
    }
  } as const;
}

function taskInclude() {
  return {
    assignee: { select: { id: true, name: true, initials: true, email: true, avatarUrl: true } },
    creator: { select: { id: true, email: true } }
  } as const;
}

function computeProgress(tasks: { status: string }[]) {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === "DONE").length;
  return Math.round((done / tasks.length) * 1000) / 10;
}

function sumTaskActuals(tasks: { actualCost: number | null }[]) {
  let s = 0;
  for (const t of tasks) {
    if (t.actualCost != null && Number.isFinite(t.actualCost)) s += t.actualCost;
  }
  return Math.round(s * 100) / 100;
}

router.get("/", async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: projectSelect()
  });

  const out = projects.map((p) => {
    const progress = computeProgress(p.tasks);
    const spentFromTasks = sumTaskActuals(p.tasks);
    const { tasks, ...rest } = p;
    return {
      ...rest,
      taskCount: tasks.length,
      doneCount: tasks.filter((t) => t.status === "DONE").length,
      progress,
      spentFromTasks
    };
  });

  return res.json(out);
});

router.post("/", requireRole("ADMIN"), validateBody(createProjectSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createProjectSchema>;
  const uid = req.user?.id;
  if (!uid) return res.status(401).json(apiError("Unauthorized"));

  const code = `PRJ-${Date.now()}`;

  if (body.leaderDirectorId != null) {
    const ld = await prisma.director.findUnique({ where: { id: body.leaderDirectorId } });
    if (!ld) return res.status(400).json(apiError("Director not found", "leaderDirectorId"));
  }

  const project = await prisma.project.create({
    data: {
      code,
      name: body.name,
      description: body.description ?? undefined,
      status: body.status ?? undefined,
      priority: body.priority ?? undefined,
      projectKind: body.projectKind ?? undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      budget: body.budget ?? undefined,
      budgetSpent: body.budgetSpent ?? undefined,
      budgetCurrency: body.budgetCurrency ?? undefined,
      leaderDirectorId: body.leaderDirectorId === null ? null : body.leaderDirectorId ?? undefined,
      contactName: body.contactName ?? undefined,
      contactEmail: body.contactEmail === "" ? null : body.contactEmail ?? undefined,
      contactPhone: body.contactPhone ?? undefined,
      createdById: uid
    },
    select: projectSelect()
  });

  const progress = computeProgress(project.tasks);
  const spentFromTasks = sumTaskActuals(project.tasks);
  const { tasks, ...rest } = project;
  return res.status(201).json({
    ...rest,
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === "DONE").length,
    progress,
    spentFromTasks
  });
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid project id"));

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, email: true } },
      leaderDirector: leaderSelect(),
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: taskInclude()
      }
    }
  });

  if (!project) return res.status(404).json(apiError("Project not found"));

  const progress = computeProgress(project.tasks);
  const spentFromTasks = sumTaskActuals(project.tasks);
  return res.json({ ...project, progress, spentFromTasks });
});

router.put("/:id", requireRole("ADMIN"), validateBody(updateProjectSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid project id"));
  const body = req.body as z.infer<typeof updateProjectSchema>;

  if (body.leaderDirectorId !== undefined && body.leaderDirectorId !== null) {
    const ld = await prisma.director.findUnique({ where: { id: body.leaderDirectorId } });
    if (!ld) return res.status(400).json(apiError("Director not found", "leaderDirectorId"));
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.projectKind !== undefined) data.projectKind = body.projectKind;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.budget !== undefined) data.budget = body.budget;
  if (body.budgetSpent !== undefined) data.budgetSpent = body.budgetSpent;
  if (body.budgetCurrency !== undefined) data.budgetCurrency = body.budgetCurrency;
  if (body.leaderDirectorId !== undefined) data.leaderDirectorId = body.leaderDirectorId;
  if (body.contactName !== undefined) data.contactName = body.contactName;
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail === "" ? null : body.contactEmail;
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone;

  try {
    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, email: true } },
        leaderDirector: leaderSelect(),
        tasks: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: taskInclude()
        }
      }
    });
    const progress = computeProgress(project.tasks);
    const spentFromTasks = sumTaskActuals(project.tasks);
    return res.json({ ...project, progress, spentFromTasks });
  } catch {
    return res.status(404).json(apiError("Project not found"));
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid project id"));
  try {
    await prisma.project.delete({ where: { id } });
    return res.status(204).send();
  } catch {
    return res.status(404).json(apiError("Project not found"));
  }
});

router.post("/:id/tasks", requireRole("ADMIN"), validateBody(createTaskSchema), async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) return res.status(400).json(apiError("Invalid project id"));
  const body = req.body as z.infer<typeof createTaskSchema>;
  const uid = req.user?.id;
  if (!uid) return res.status(401).json(apiError("Unauthorized"));

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return res.status(404).json(apiError("Project not found"));

  if (body.assigneeDirectorId != null) {
    const d = await prisma.director.findUnique({ where: { id: body.assigneeDirectorId } });
    if (!d) return res.status(400).json(apiError("Director not found", "assigneeDirectorId"));
  }

  const task = await prisma.projectTask.create({
    data: {
      projectId,
      title: body.title,
      description: body.description ?? undefined,
      status: body.status ?? undefined,
      priority: body.priority ?? undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      assigneeDirectorId: body.assigneeDirectorId === null ? null : body.assigneeDirectorId ?? undefined,
      sortOrder: body.sortOrder ?? 0,
      estimatedCost: body.estimatedCost === null ? null : body.estimatedCost ?? undefined,
      actualCost: body.actualCost === null ? null : body.actualCost ?? undefined,
      completedAt: body.status === "DONE" ? new Date() : undefined,
      createdById: uid
    },
    include: taskInclude()
  });

  return res.status(201).json(task);
});

router.put("/:projectId/tasks/:taskId", requireRole("ADMIN"), validateBody(updateTaskSchema), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(projectId) || !Number.isFinite(taskId)) {
    return res.status(400).json(apiError("Invalid id"));
  }
  const body = req.body as z.infer<typeof updateTaskSchema>;

  const existing = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
  if (!existing) return res.status(404).json(apiError("Task not found"));

  if (body.assigneeDirectorId !== undefined && body.assigneeDirectorId !== null) {
    const d = await prisma.director.findUnique({ where: { id: body.assigneeDirectorId } });
    if (!d) return res.status(400).json(apiError("Director not found", "assigneeDirectorId"));
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.assigneeDirectorId !== undefined) data.assigneeDirectorId = body.assigneeDirectorId;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.estimatedCost !== undefined) data.estimatedCost = body.estimatedCost;
  if (body.actualCost !== undefined) data.actualCost = body.actualCost;

  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === "DONE") data.completedAt = new Date();
    else if (existing.status === "DONE") data.completedAt = null;
  }

  const task = await prisma.projectTask.update({
    where: { id: taskId },
    data,
    include: taskInclude()
  });

  return res.json(task);
});

router.delete("/:projectId/tasks/:taskId", requireRole("ADMIN"), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(projectId) || !Number.isFinite(taskId)) {
    return res.status(400).json(apiError("Invalid id"));
  }

  const existing = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
  if (!existing) return res.status(404).json(apiError("Task not found"));

  await prisma.projectTask.delete({ where: { id: taskId } });
  return res.status(204).send();
});

export default router;
