import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";

export type AuthUser = { id: number; email: string; role: "ADMIN" | "DIRECTOR"; directorId: number | null };

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
  try {
    const payload = jwt.verify(token, getSecret()) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json(apiError("Unauthorized"));
  }
}

export function requireRole(role: AuthUser["role"]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json(apiError("Unauthorized"));
    if (req.user.role !== role) return res.status(403).json(apiError("Forbidden"));
    next();
  };
}

