import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { writeAudit } from "../lib/audit.js";
import { deleteDirectorAvatar, saveDirectorAvatar } from "../lib/avatarStorage.js";
import { requireAdminOrDirectorSelf, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res) => {
  const directors = await prisma.director.findMany({ orderBy: { createdAt: "asc" } });
  return res.json(directors);
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  initials: z.string().min(1).max(3),
  email: z.string().email(),
  joinedRound: z.number().int().positive().optional(),
  active: z.boolean().optional()
});

router.post("/", requireRole("ADMIN"), validateBody(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const email = body.email.toLowerCase().trim();

  const existing = await prisma.director.findUnique({ where: { email } });
  if (existing) return res.status(400).json(apiError("Email already in use", "email"));

  const director = await prisma.director.create({
    data: {
      name: body.name,
      initials: body.initials.toUpperCase(),
      email,
      joinedRound: body.joinedRound ?? 1,
      active: body.active ?? true
    }
  });

  return res.status(201).json(director);
});

const updateSchema = createSchema.partial();

router.put("/:id", validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const body = req.body as z.infer<typeof updateSchema>;
  const data: any = { ...body };
  if (data.email) data.email = data.email.toLowerCase().trim();
  if (data.initials) data.initials = data.initials.toUpperCase();

  try {
    const updated = await prisma.director.update({ where: { id }, data });
    return res.json(updated);
  } catch {
    return res.status(404).json(apiError("Director not found"));
  }
});

function extFromMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg" || m === "image/jpe" || m === "image/pjpeg") return ".jpg";
  if (m === "image/png" || m === "image/x-png") return ".png";
  if (m === "image/gif") return ".gif";
  if (m === "image/webp") return ".webp";
  return ".jpg";
}

function extFromOriginalOrMime(file: Express.Multer.File): string {
  const fromName = path.extname(file.originalname || "").toLowerCase();
  if (fromName === ".jpeg" || fromName === ".jpg" || fromName === ".jpe") return ".jpg";
  if (fromName === ".png") return ".png";
  if (fromName === ".gif") return ".gif";
  if (fromName === ".webp") return ".webp";
  return extFromMime(file.mimetype);
}

function avatarFileOk(file: Express.Multer.File): boolean {
  const mime = (file.mimetype || "").toLowerCase();
  if (/^image\/(jpeg|jpg|jpe|png|gif|webp|pjpeg|x-png)$/i.test(mime)) return true;
  const ext = path.extname(file.originalname || "").toLowerCase();
  const extOk = [".jpg", ".jpeg", ".jpe", ".png", ".gif", ".webp"].includes(ext);
  if (!extOk) return false;
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") return true;
  return false;
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (avatarFileOk(file)) return cb(null, true);
    cb(
      new Error(
        "Only JPEG, PNG, GIF, or WebP images are allowed (max 2 MB). If you use an iPhone, convert HEIC to JPEG or pick a JPG/PNG file."
      )
    );
  }
});

router.post(
  "/:id/avatar",
  requireAdminOrDirectorSelf("id"),
  (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));
    next();
  },
  (req, res, next) => {
    avatarUpload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json(apiError("Image must be 2MB or smaller", "file"));
        }
        return res.status(400).json(apiError(err.message, "file"));
      }
      if (err) {
        return res.status(400).json(apiError(err.message || "Invalid image file", "file"));
      }
      next();
    });
  },
  async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file?.buffer) return res.status(400).json(apiError("Image file is required", "file"));

    const director = await prisma.director.findUnique({ where: { id } });
    if (!director) return res.status(404).json(apiError("Director not found"));

    const ext = extFromOriginalOrMime(req.file);
    const contentType = req.file.mimetype || "application/octet-stream";

    await deleteDirectorAvatar(director.avatarUrl);
    const { publicUrl } = await saveDirectorAvatar({
      directorId: id,
      buffer: req.file.buffer,
      ext,
      contentType
    });

    const updated = await prisma.director.update({
      where: { id },
      data: { avatarUrl: publicUrl }
    });

    await writeAudit(req, {
      action: "SET_DIRECTOR_AVATAR",
      entityType: "Director",
      entityId: id,
      before: { avatarUrl: director.avatarUrl },
      after: { avatarUrl: publicUrl }
    });

    return res.json(updated);
  }
);

router.delete("/:id/avatar", requireAdminOrDirectorSelf("id"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const director = await prisma.director.findUnique({ where: { id } });
  if (!director) return res.status(404).json(apiError("Director not found"));

  await deleteDirectorAvatar(director.avatarUrl);
  const updated = await prisma.director.update({ where: { id }, data: { avatarUrl: null } });

  await writeAudit(req, {
    action: "DELETE_DIRECTOR_AVATAR",
    entityType: "Director",
    entityId: id,
    before: { avatarUrl: director.avatarUrl },
    after: null
  });

  return res.json(updated);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const director = await prisma.director.findUnique({ where: { id } });
  if (!director) return res.status(404).json(apiError("Director not found"));

  const transactions = await prisma.transaction.findMany({
    where: { directorId: id, type: { in: ["CONTRIBUTION", "SIDE_FUND", "PENALTY"] } },
    orderBy: { date: "desc" }
  });

  return res.json({ director, transactions });
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));

  const hasTx = await prisma.transaction.count({ where: { directorId: id } });
  if (hasTx > 0) {
    return res
      .status(400)
      .json(
        apiError(
          "Cannot delete director with existing transactions. Consider marking them inactive instead.",
          "id"
        )
      );
  }

  try {
    const existing = await prisma.director.findUnique({ where: { id } });
    if (!existing) return res.status(404).json(apiError("Director not found"));
    await prisma.director.delete({ where: { id } });
    await deleteDirectorAvatar(existing.avatarUrl);
    return res.json({ ok: true });
  } catch {
    return res.status(404).json(apiError("Director not found"));
  }
});

export default router;
