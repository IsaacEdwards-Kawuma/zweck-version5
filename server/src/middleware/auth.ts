import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { apiError } from "../lib/http.js";

export type AuthUser = { id: number; email: string; role: "ADMIN" | "DIRECTOR"; directorId: number | null };

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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

