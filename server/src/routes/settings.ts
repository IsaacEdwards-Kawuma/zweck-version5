import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { isS3AvatarStorageConfigured } from "../lib/avatarStorage.js";
import { getPublicAppUrl } from "../lib/publicAppUrl.js";
import { getServerPackageVersion } from "../lib/serverVersion.js";
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/http.js";
import { getOrCreateAppSettings } from "../lib/appSettings.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

/**
 * Authenticated summary for the Settings UI: monitoring flags, rate-limit numbers, version.
 * Does not expose secrets (DSN, SMTP passwords, JWT).
 */
router.get("/", async (req, res) => {
  const user = req.user!;
  const isAdmin = user.role === "ADMIN";
  const [dbUser, orgRow] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        lastLoginAt: true,
        emailMeetingReminders: true,
        inAppMeetingReminders: true,
        inAppChatMessages: true
      }
    }),
    getOrCreateAppSettings()
  ]);
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
      lastLoginAt: dbUser?.lastLoginAt ?? null,
      emailMeetingReminders: dbUser?.emailMeetingReminders ?? true
    },
    runtime: isAdmin
      ? {
          nodeEnv: process.env.NODE_ENV || "development",
          uptimeSeconds: Math.floor(process.uptime()),
          memory: (() => {
            const m = process.memoryUsage();
            return {
              heapUsedMb: Math.round((m.heapUsed / 1024 / 1024) * 100) / 100,
              rssMb: Math.round((m.rss / 1024 / 1024) * 100) / 100
            };
          })()
        }
      : null,
    monitoring: isAdmin
      ? {
          sentryServer: Boolean(process.env.SENTRY_DSN?.trim()),
          smtpConfigured: Boolean(process.env.SMTP_HOST?.trim()),
          cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
          publicAppUrlConfigured: Boolean(getPublicAppUrl()),
          avatarStorage: isS3AvatarStorageConfigured() ? "s3" : "local",
          logLevel: process.env.LOG_LEVEL || "info",
          structuredLogging: true
        }
      : null,
    rateLimits: isAdmin
      ? {
          apiRequestsPerWindow: Number(process.env.RATE_LIMIT_API_MAX || 500),
          loginRequestsPerWindow: Number(process.env.RATE_LIMIT_LOGIN_MAX || 30),
          forgotPasswordPerHour: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || 5),
          failedLoginBurstThreshold: Number(process.env.FAILED_LOGIN_BURST_THRESHOLD || 5),
          failedLoginBurstWindowMinutes: Number(process.env.FAILED_LOGIN_BURST_WINDOW_MINUTES || 10),
          apiWindowMinutes: 15,
          loginWindowMinutes: 15,
          forgotPasswordWindowMinutes: 60
        }
      : null,
    deployment: isAdmin
      ? {
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
        }
      : null,
    readiness: isAdmin
      ? {
          workspacePersistence: true,
          meetingsApi: true,
          documentsApi: true,
          reconciliationApi: true,
          sentryAlertsConfigured: Boolean(process.env.SENTRY_ALERT_WEBHOOK?.trim() || process.env.SENTRY_ALERT_EMAIL?.trim()),
          incidentRunbookConfigured: Boolean(process.env.INCIDENT_RUNBOOK_URL?.trim())
        }
      : null,
    endpoints: {
      health: "/api/health",
      openapi: "/api/openapi.json",
      docs: "/api/docs"
    },
    org: {
      companyName: orgRow.companyName,
      baseCurrency: orgRow.baseCurrency,
      fiscalYearStartMonth: orgRow.fiscalYearStartMonth,
      defaultReportDays: orgRow.defaultReportDays
    }
  });
});

router.patch("/notifications", async (req, res) => {
  const user = req.user!;
  const body = req.body || {};
  const data: { emailMeetingReminders?: boolean; inAppMeetingReminders?: boolean; inAppChatMessages?: boolean } = {};
  if ("emailMeetingReminders" in body) {
    if (typeof body.emailMeetingReminders !== "boolean") {
      return res.status(400).json(apiError("emailMeetingReminders must be a boolean"));
    }
    data.emailMeetingReminders = body.emailMeetingReminders;
  }
  if ("inAppMeetingReminders" in body) {
    if (typeof body.inAppMeetingReminders !== "boolean") {
      return res.status(400).json(apiError("inAppMeetingReminders must be a boolean"));
    }
    data.inAppMeetingReminders = body.inAppMeetingReminders;
  }
  if ("inAppChatMessages" in body) {
    if (typeof body.inAppChatMessages !== "boolean") {
      return res.status(400).json(apiError("inAppChatMessages must be a boolean"));
    }
    data.inAppChatMessages = body.inAppChatMessages;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json(
      apiError("Provide emailMeetingReminders, inAppMeetingReminders, and/or inAppChatMessages")
    );
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: { emailMeetingReminders: true, inAppMeetingReminders: true, inAppChatMessages: true }
  });
  res.json(updated);
});

router.patch("/org", requireRole("ADMIN"), async (req, res) => {
  const body = req.body || {};
  const data: Prisma.AppSettingsUpdateInput = {};
  if ("companyName" in body) {
    if (typeof body.companyName !== "string" || body.companyName.length > 200) {
      return res.status(400).json(apiError("companyName must be a string with length at most 200"));
    }
    data.companyName = body.companyName.trim();
  }
  if ("baseCurrency" in body) {
    const c = typeof body.baseCurrency === "string" ? body.baseCurrency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(c)) {
      return res.status(400).json(apiError("baseCurrency must be a 3-letter ISO 4217 code"));
    }
    data.baseCurrency = c;
  }
  if ("fiscalYearStartMonth" in body) {
    const m = Number(body.fiscalYearStartMonth);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json(apiError("fiscalYearStartMonth must be an integer from 1 to 12"));
    }
    data.fiscalYearStartMonth = m;
  }
  if ("defaultReportDays" in body) {
    const d = Number(body.defaultReportDays);
    if (!Number.isInteger(d) || d < 1 || d > 3660) {
      return res.status(400).json(apiError("defaultReportDays must be an integer from 1 to 3660"));
    }
    data.defaultReportDays = d;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json(
      apiError("Provide at least one of companyName, baseCurrency, fiscalYearStartMonth, defaultReportDays")
    );
  }
  await getOrCreateAppSettings();
  const updated = await prisma.appSettings.update({
    where: { id: 1 },
    data,
    select: {
      companyName: true,
      baseCurrency: true,
      fiscalYearStartMonth: true,
      defaultReportDays: true
    }
  });
  res.json(updated);
});

export default router;
