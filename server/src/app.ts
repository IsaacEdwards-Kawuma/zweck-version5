import fs, { readFileSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { buildCorsOptions, isOriginAllowed } from "./lib/cors.js";
import { isS3AvatarStorageConfigured } from "./lib/avatarStorage.js";
import { logger } from "./lib/logger.js";
import { apiError } from "./lib/http.js";
import { Sentry } from "./instrument.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import transactionsRoutes from "./routes/transactions.js";
import accountsRoutes from "./routes/accounts.js";
import directorsRoutes from "./routes/directors.js";
import portfolioRoutes from "./routes/portfolio.js";
import mmfRoutes from "./routes/mmf.js";
import circulationRoutes from "./routes/circulation.js";
import usersRoutes from "./routes/users.js";
import projectsRoutes from "./routes/projects.js";
import auditRoutes from "./routes/audit.js";
import settingsRoutes from "./routes/settings.js";
import notificationsRoutes from "./routes/notifications.js";
import meetingsRoutes from "./routes/meetings.js";
import documentsRoutes from "./routes/documents.js";
import reconciliationRoutes from "./routes/reconciliation.js";
import reportsRoutes from "./routes/reports.js";
import aboutPageRoutes from "./routes/aboutPage.js";
import searchRoutes from "./routes/search.js";
import adminExportRoutes from "./routes/adminExport.js";
import integrationsRoutes from "./routes/integrations.js";
import jobsRoutes from "./routes/jobs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openapiDocument = JSON.parse(readFileSync(join(__dirname, "openapi.json"), "utf8")) as Record<string, unknown>;

export function createApp(): express.Express {
  const app = express();

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false
    })
  );

  app.use(
    pinoHttp({
      logger,
      autoLogging: true,
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      }
    })
  );

  const uploadRoot = path.join(process.cwd(), "uploads");
  const avatarDir = path.join(uploadRoot, "avatars");
  fs.mkdirSync(avatarDir, { recursive: true });

  const corsOptions = buildCorsOptions();

  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_API_MAX || 500),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const pathOnly = req.originalUrl?.split("?")[0] || "";
      if (pathOnly === "/api/health" || pathOnly.startsWith("/api/uploads")) return true;
      if (pathOnly === "/api/openapi.json" || pathOnly.startsWith("/api/docs")) return true;
      if (pathOnly.startsWith("/api/jobs/")) return true;
      return false;
    }
  });

  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      avatarStorage: isS3AvatarStorageConfigured() ? "s3" : "local"
    })
  );

  app.get("/api/openapi.json", (_req, res) => res.json(openapiDocument));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

  app.use("/api/uploads", express.static(uploadRoot));

  app.use("/api/auth", authRoutes);

  app.use("/api/jobs", jobsRoutes);

  app.use("/api", requireAuth);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/accounts", accountsRoutes);
  app.use("/api/directors", directorsRoutes);
  app.use("/api/portfolio", portfolioRoutes);
  app.use("/api/mmf", mmfRoutes);
  app.use("/api/circulation", circulationRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/projects", projectsRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/meetings", meetingsRoutes);
  app.use("/api/documents", documentsRoutes);
  app.use("/api/reconciliation", reconciliationRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/about-page", aboutPageRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/admin", adminExportRoutes);
  app.use("/api/integrations", integrationsRoutes);

  app.use((_req, res) => res.status(404).json(apiError("Not found")));

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error && err.message === "Not allowed by CORS") {
      logger.warn({ origin: req.headers.origin }, "[cors] blocked origin");
      if (res.headersSent) return;
      return res.status(403).json(apiError("Forbidden"));
    }

    const origin = req.headers.origin;
    if (typeof origin === "string" && isOriginAllowed(origin) && !res.headersSent) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (process.env.SENTRY_DSN?.trim()) {
      Sentry.captureException(err);
    }
    logger.error(err);
    if (res.headersSent) return;
    return res.status(500).json(apiError("Internal server error"));
  });

  return app;
}
