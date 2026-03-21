import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

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
  if (!user) return res.status(404).json(apiError("User not found"));
  return res.json(user);
});

export default router;

