import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";
import { apiError } from "../lib/http.js";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return res.status(400).json(apiError(first?.message ?? "Invalid input", first?.path?.[0]?.toString()));
      }
      return res.status(400).json(apiError("Invalid input"));
    }
  };
}

