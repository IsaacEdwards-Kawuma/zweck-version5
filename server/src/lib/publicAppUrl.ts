/**
 * Base URL of the web app (for password-reset links in emails).
 * Prefer PUBLIC_APP_URL; fall back to CLIENT_ORIGIN (CORS).
 */
export function getPublicAppUrl(): string {
  const a = process.env.PUBLIC_APP_URL?.trim();
  const b = process.env.CLIENT_ORIGIN?.trim();
  const url = a || b;
  if (url) return url.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:5173";
  return "";
}
