import type { CorsOptions } from "cors";

/** True for http(s) loopback (incl. IPv6 ::1 — common on Windows when “localhost” resolves to ::1). */
function isLoopbackBrowserOrigin(origin: string): boolean {
  return (
    /^https?:\/\/localhost(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/\[::1\](?::\d+)?$/i.test(origin)
  );
}

function normalizeOrigin(origin: string): string {
  // Some deployments configure ALLOWED_ORIGINS with a trailing slash.
  // Browser Origin never includes a trailing slash, so normalize to prevent false mismatches.
  return origin.trim().replace(/\/$/, "");
}

/**
 * Shared origin check (used by CORS middleware + error handler so 500s still expose CORS headers).
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  const originNorm = normalizeOrigin(origin);

  // Local dev: allow any origin so Vite, LAN IPs, IPv6 ::1, etc. all work without env tuning.
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // Production-like runs on the same machine (e.g. NODE_ENV=production in server/.env): still allow loopback.
  if (isLoopbackBrowserOrigin(originNorm)) {
    return true;
  }

  const fromEnv: string[] = [];
  if (process.env.CLIENT_ORIGIN?.trim()) {
    fromEnv.push(normalizeOrigin(process.env.CLIENT_ORIGIN.trim()));
  }
  if (process.env.ALLOWED_ORIGINS?.trim()) {
    fromEnv.push(
      ...process.env.ALLOWED_ORIGINS
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(normalizeOrigin)
    );
  }

  if (fromEnv.includes(originNorm)) return true;

  if (process.env.ALLOW_VERCEL_PREVIEWS === "true") {
    if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(originNorm)) {
      return true;
    }
  }

  return false;
}

/**
 * CORS for local dev + production (Vercel, custom domains).
 * Set on Render:
 * - ALLOWED_ORIGINS=https://your-app.vercel.app,https://www.example.com
 * - Or CLIENT_ORIGIN=https://your-app.vercel.app (single URL)
 * - ALLOW_VERCEL_PREVIEWS=true to allow any https://*.vercel.app (preview deployments)
 */
export function buildCorsOptions(): CorsOptions {
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true
  };
}
