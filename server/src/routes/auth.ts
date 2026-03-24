import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

function signToken(user: {
  id: number;
  email: string;
  role: "ADMIN" | "USER" | "DIRECTOR";
  directorId: number | null;
  sessionId?: number | null;
}) {
  const payload: AuthUser = { ...user };
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

function requestIp(req: { headers: Record<string, unknown>; ip?: string }): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.ip || null;
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
    if (!ok) {
      const ipFail = requestIp(req);
      const uaFail = req.headers["user-agent"] || null;
      await prisma.loginEvent.create({
        data: {
          userId: user.id,
          success: false,
          ip: ipFail,
          userAgent: typeof uaFail === "string" ? uaFail : null
        }
      });
      return res.status(401).json(apiError("Invalid email or password"));
    }

    const ip = requestIp(req);
    const userAgent = req.headers["user-agent"] || null;
    const [, loginEvent] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      }),
      prisma.loginEvent.create({
        data: {
          userId: user.id,
          success: true,
          ip,
          userAgent: typeof userAgent === "string" ? userAgent : null
        }
      })
    ]);

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      directorId: user.directorId ?? null,
      sessionId: (loginEvent as any)?.id ?? null
    });
    return res.json({ token });
  }
);

router.post("/logout", requireAuth, async (req, res) => {
  const sessionId = req.user?.sessionId;
  if (sessionId && Number.isFinite(sessionId)) {
    await prisma.loginEvent.updateMany({
      where: { id: Number(sessionId), userId: req.user!.id, logoutAt: null },
      data: { logoutAt: new Date() }
    });
  } else {
    await prisma.loginEvent.updateMany({
      where: { userId: req.user!.id, logoutAt: null },
      data: { logoutAt: new Date() }
    });
  }
  return res.json({ ok: true });
});

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
  role: z.enum(["ADMIN", "USER", "DIRECTOR"]).optional(),
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
  // Public signup:
  // - first account becomes ADMIN
  // - all subsequent signups become USER
  return handleRegister(parsed, bootstrap, null, res);
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

  const role: "ADMIN" | "USER" = bootstrap ? "ADMIN" : "USER";

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
    select: {
      id: true,
      email: true,
      role: true,
      directorId: true,
      createdAt: true,
      lastLoginAt: true,
      director: {
        select: {
          id: true,
          name: true,
          initials: true,
          avatarUrl: true
        }
      }
    }
  });
  if (user) return res.json(user);
  if (isAuthDisabled() && req.user) {
    return res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      directorId: req.user.directorId,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    });
  }
  return res.status(404).json(apiError("User not found"));
});

/** Machine-readable export of the signed-in user's account + linked director profile (no password hash). */
router.get("/me/data-export", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      role: true,
      directorId: true,
      createdAt: true,
      lastLoginAt: true,
      director: true
    }
  });
  if (!user) return res.status(404).json(apiError("User not found"));
  const directorTransactions = user.directorId
    ? await prisma.transaction.findMany({
        where: { directorId: user.directorId },
        take: 5000,
        orderBy: { date: "desc" },
        select: { id: true, type: true, date: true, amount: true, description: true }
      })
    : [];
  return res.json({
    exportedAt: new Date().toISOString(),
    purpose: "personal_data_export",
    user,
    directorTransactions
  });
});

const erasureBody = z.object({
  notes: z.string().max(2000).optional()
});

/** Records a GDPR-style erasure request; fulfilment is manual (DB + backups). */
router.post("/me/erasure-request", requireAuth, validateBody(erasureBody), async (req, res) => {
  const notes = (req.body as z.infer<typeof erasureBody>).notes ?? null;
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: "ERASURE_REQUEST",
      entityType: "User",
      entityId: req.user!.id,
      after: { notes } as Prisma.InputJsonValue
    }
  });
  return res.json({
    ok: true,
    message: "Your request was recorded. An administrator will review it and may contact you to confirm identity."
  });
});

export default router;

