import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";

export type AuthUser = {
  id: number;
  email: string;
  role: "ADMIN" | "USER" | "DIRECTOR" | "TREASURER" | "SECRETARY" | "OPERATIONAL_MANAGER" | "CEO";
  directorId: number | null;
  sessionId?: number | null;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function isAuthDisabled(): boolean {
  const v = process.env.AUTH_DISABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * When AUTH_DISABLED=true, JWT is skipped and the first user in the DB is used (or a dev placeholder).
 * Remove in production — see server/.env.example.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthDisabled()) {
    void (async () => {
      try {
        const first = await prisma.user.findFirst({ orderBy: { id: "asc" } });
        if (first) {
          req.user = {
            id: first.id,
            email: first.email,
            role: first.role,
            directorId: first.directorId ?? null
          };
        } else {
          req.user = {
            id: 1,
            email: "auth-disabled@local",
            role: "ADMIN",
            directorId: null
          };
        }
        next();
      } catch (e) {
        next(e);
      }
    })();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json(apiError("Unauthorized"));

  const token = header.slice("Bearer ".length).trim();
  void (async () => {
    try {
      const payload = jwt.verify(token, getSecret()) as AuthUser;
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          role: true,
          directorId: true,
          deletedAt: true,
          isActive: true,
          adminBlockedAt: true
        }
      });
      if (!dbUser) return res.status(401).json(apiError("Unauthorized"));
      if (dbUser.deletedAt || !dbUser.isActive || dbUser.adminBlockedAt) {
        return res.status(401).json(apiError("Session no longer valid"));
      }
      req.user = {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        directorId: dbUser.directorId ?? null,
        ...(typeof payload.sessionId === "number" ? { sessionId: payload.sessionId } : {})
      };
      next();
    } catch {
      return res.status(401).json(apiError("Unauthorized"));
    }
  })();
}

export function requireRole(role: AuthUser["role"]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json(apiError("Unauthorized"));
    if (req.user.role !== role) return res.status(403).json(apiError("Forbidden"));
    next();
  };
}

/** Approve/reject internal forms (requisitions, etc.). */
export function requireTreasurerOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json(apiError("Unauthorized"));
  if (req.user.role === "ADMIN" || req.user.role === "TREASURER") return next();
  return res.status(403).json(apiError("Treasurer or admin only"));
}

/** Admins, or directors editing their own profile (same `directorId` as `:id`). */
export function requireAdminOrDirectorSelf(paramName: string = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json(apiError("Unauthorized"));
    if (req.user.role === "ADMIN") return next();
    const raw = req.params[paramName];
    const id = Number(raw);
    if (!Number.isFinite(id)) return res.status(400).json(apiError("Invalid director id"));
    if (req.user.role === "DIRECTOR" && req.user.directorId === id) return next();
    return res.status(403).json(apiError("Forbidden"));
  };
}

