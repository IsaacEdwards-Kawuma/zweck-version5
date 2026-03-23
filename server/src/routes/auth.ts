import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { getPublicAppUrl } from "../lib/publicAppUrl.js";
import { logger } from "../lib/logger.js";
import { isAuthDisabled, requireAuth, type AuthUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(apiError("Too many login attempts. Try again later."));
  }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(apiError("Too many password reset requests. Try again later."));
  }
});

function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

const FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email, we sent password reset instructions.";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

function signToken(user: { id: number; email: string; role: "ADMIN" | "DIRECTOR"; directorId: number | null }) {
  const payload: AuthUser = { ...user };
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

router.post(
  "/login",
  loginLimiter,
  validateBody(
    z.object({
      email: z.string().email(),
      password: z.string().min(1)
    })
  ),
  async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json(apiError("Invalid email or password"));

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json(apiError("Invalid email or password"));

    const token = signToken({ id: user.id, email: user.email, role: user.role, directorId: user.directorId ?? null });
    return res.json({ token });
  }
);

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateBody(z.object({ email: z.string().email() })),
  async (req, res) => {
    const email = (req.body as { email: string }).email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE });

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const raw = randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(raw);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt }
    });

    const base = getPublicAppUrl();
    if (!base) {
      logger.warn("[auth] PUBLIC_APP_URL / CLIENT_ORIGIN not set — using localhost for reset link");
    }
    const resetUrl = `${base || "http://localhost:5173"}/reset-password?token=${encodeURIComponent(raw)}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (e) {
      logger.error(e);
      return res.status(500).json(apiError("Could not send email. Try again later."));
    }

    return res.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE });
  }
);

router.post(
  "/reset-password",
  loginLimiter,
  validateBody(
    z.object({
      token: z.string().min(32),
      password: z.string().min(8).max(200)
    })
  ),
  async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };
    const tokenHash = hashResetToken(token);
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!row || row.expiresAt < new Date()) {
      return res.status(400).json(apiError("Invalid or expired reset link"));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { password: passwordHash } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } })
    ]);

    await prisma.auditLog.create({
      data: {
        userId: row.userId,
        action: "PASSWORD_RESET",
        entityType: "User",
        entityId: row.userId,
        after: { email: row.user.email }
      }
    });

    return res.json({ ok: true, message: "Password updated. You can sign in now." });
  }
);

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(["ADMIN", "DIRECTOR"]).optional(),
  director: z
    .object({
      name: z.string().min(1).max(120),
      initials: z.string().min(1).max(3),
      email: z.string().email(),
      joinedRound: z.number().int().positive().optional(),
      active: z.boolean().optional()
    })
    .optional()
});

router.get("/bootstrap-status", async (_req, res) => {
  const usersCount = await prisma.user.count();
  return res.json({
    usersCount,
    bootstrapOpen: usersCount === 0
  });
});

router.post("/register", validateBody(registerBody), async (req, res) => {
  const parsed = req.body as z.infer<typeof registerBody>;

  const usersCount = await prisma.user.count();
  const bootstrap = usersCount === 0;

  if (!bootstrap) {
    // admin-only once the first user exists
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json(apiError("Unauthorized"));
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = jwt.verify(token, getSecret()) as AuthUser;
      if (payload.role !== "ADMIN") return res.status(403).json(apiError("Forbidden"));
      return handleRegister(parsed, false, payload.id, res);
    } catch {
      return res.status(401).json(apiError("Unauthorized"));
    }
  }

  // bootstrap path: allow creating the very first ADMIN user (no seed; user triggers it)
  return handleRegister(parsed, true, null, res);
});

async function handleRegister(
  body: z.infer<typeof registerBody>,
  bootstrap: boolean,
  createdByUserId: number | null,
  res: any
) {
  const email = body.email.toLowerCase().trim();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return res.status(400).json(apiError("Email already in use", "email"));

  const passwordHash = await bcrypt.hash(body.password, 12);

  const role: "ADMIN" | "DIRECTOR" =
    bootstrap ? "ADMIN" : body.role ?? (body.director ? "DIRECTOR" : "ADMIN");

  let directorId: number | null = null;
  if (body.director) {
    const dirEmail = body.director.email.toLowerCase().trim();
    const existingDirector = await prisma.director.findUnique({ where: { email: dirEmail } });
    if (existingDirector) return res.status(400).json(apiError("Director email already exists", "director.email"));

    const director = await prisma.director.create({
      data: {
        name: body.director.name,
        initials: body.director.initials.toUpperCase(),
        email: dirEmail,
        joinedRound: body.director.joinedRound ?? 1,
        active: body.director.active ?? true
      }
    });
    directorId = director.id;
  }

  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role,
      directorId
    }
  });

  const token = signToken({ id: user.id, email: user.email, role: user.role, directorId: user.directorId ?? null });

  return res.json({
    token,
    bootstrap,
    createdByUserId
  });
}

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, role: true, directorId: true, createdAt: true }
  });
  if (user) return res.json(user);
  if (isAuthDisabled() && req.user) {
    return res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      directorId: req.user.directorId,
      createdAt: new Date().toISOString()
    });
  }
  return res.status(404).json(apiError("User not found"));
});

export default router;

