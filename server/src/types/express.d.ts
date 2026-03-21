import "express";
import type { AuthUser } from "../middleware/auth.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

