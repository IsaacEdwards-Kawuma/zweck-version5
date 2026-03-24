import { Router } from "express";
import { isS3AvatarStorageConfigured } from "../lib/avatarStorage.js";
import { getPublicAppUrl } from "../lib/publicAppUrl.js";
import { getServerPackageVersion } from "../lib/serverVersion.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

/**
 * Authenticated summary for the Settings UI: monitoring flags, rate-limit numbers, version.
 * Does not expose secrets (DSN, SMTP passwords, JWT).
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { lastLoginAt: true }
  });
  res.json({
    app: {
      name: "ZweckOS API",
      version: getServerPackageVersion()
    },
    session: {
      userId: user.id,
      email: user.email,
      role: user.role,
      directorId: user.directorId,
      lastLoginAt: dbUser?.lastLoginAt ?? null
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      memory: (() => {
        const m = process.memoryUsage();
        return {
          heapUsedMb: Math.round((m.heapUsed / 1024 / 1024) * 100) / 100,
          rssMb: Math.round((m.rss / 1024 / 1024) * 100) / 100
        };
      })()
    },
    monitoring: {
      sentryServer: Boolean(process.env.SENTRY_DSN?.trim()),
      smtpConfigured: Boolean(process.env.SMTP_HOST?.trim()),
      publicAppUrlConfigured: Boolean(getPublicAppUrl()),
      avatarStorage: isS3AvatarStorageConfigured() ? "s3" : "local",
      logLevel: process.env.LOG_LEVEL || "info",
      structuredLogging: true
    },
    rateLimits: {
      apiRequestsPerWindow: Number(process.env.RATE_LIMIT_API_MAX || 500),
      loginRequestsPerWindow: Number(process.env.RATE_LIMIT_LOGIN_MAX || 30),
      forgotPasswordPerHour: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || 5),
      apiWindowMinutes: 15,
      loginWindowMinutes: 15,
      forgotPasswordWindowMinutes: 60
    },
    deployment: {
      authDisabled: ["true", "1", "yes"].includes(String(process.env.AUTH_DISABLED || "").trim().toLowerCase()),
      jwtConfigured: Boolean(process.env.JWT_SECRET?.trim()),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
      directUrlConfigured: Boolean(process.env.DIRECT_URL?.trim()),
      allowedOriginsConfigured: Boolean(process.env.ALLOWED_ORIGINS?.trim() || process.env.CLIENT_ORIGIN?.trim()),
      vercelPreviewOriginsEnabled: ["true", "1", "yes"].includes(
        String(process.env.ALLOW_VERCEL_PREVIEWS || "")
          .trim()
          .toLowerCase()
      )
    },
    readiness: {
      workspacePersistence: true,
      meetingsApi: true,
      documentsApi: true,
      reconciliationApi: true,
      sentryAlertsConfigured: Boolean(process.env.SENTRY_ALERT_WEBHOOK?.trim() || process.env.SENTRY_ALERT_EMAIL?.trim()),
      incidentRunbookConfigured: Boolean(process.env.INCIDENT_RUNBOOK_URL?.trim())
    },
    endpoints: {
      health: "/api/health",
      openapi: "/api/openapi.json",
      docs: "/api/docs"
    }
  });
});

export default router;
