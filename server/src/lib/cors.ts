import type { CorsOptions } from "cors";

/**
 * CORS for local dev + production (Vercel, custom domains).
 * Set on Render:
 * - ALLOWED_ORIGINS=https://your-app.vercel.app,https://www.example.com
 * - Or CLIENT_ORIGIN=https://your-app.vercel.app (single URL)
 * - ALLOW_VERCEL_PREVIEWS=true to allow any https://*.vercel.app (preview deployments)
 */
export function buildCorsOptions(): CorsOptions {
  const isProd = process.env.NODE_ENV === "production";

  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true);

      // Dev: any localhost port
      if (!isProd) {
        if (
          /^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
        ) {
          return cb(null, true);
        }
      }

      const fromEnv: string[] = [];
      if (process.env.CLIENT_ORIGIN?.trim()) {
        fromEnv.push(process.env.CLIENT_ORIGIN.trim());
      }
      if (process.env.ALLOWED_ORIGINS?.trim()) {
        fromEnv.push(
          ...process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
        );
      }

      if (fromEnv.includes(origin)) return cb(null, true);

      if (process.env.ALLOW_VERCEL_PREVIEWS === "true") {
        if (/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)) {
          return cb(null, true);
        }
      }

      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true
  };
}
