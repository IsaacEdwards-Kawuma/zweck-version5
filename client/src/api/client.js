import axios from "axios";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

/**
 * Ensures calls hit `/api/...` on the host. Render’s app mounts routes under `/api`.
 * Common mistake: `VITE_API_URL=https://xxx.onrender.com` → requests go to `/auth/login` (404).
 * This normalizes to `https://xxx.onrender.com/api`.
 */
function normalizeRemoteApiBase(url) {
  let u = url.replace(/\/+$/, "");
  if (!u.endsWith("/api")) u = `${u}/api`;
  return u;
}

/** Render API host (e.g. zweck-version5.onrender.com). */
function isRenderHost(hostname) {
  return hostname === "onrender.com" || hostname.endsWith(".onrender.com");
}

/**
 * If VITE_API_URL points at Render but the page is on another origin (e.g. Vercel), calling Render
 * directly hits CORS unless ALLOWED_ORIGINS is perfect. Prefer same-origin `/api` + RENDER_API_URL proxy.
 * Set VITE_API_DIRECT=true only if you intentionally call Render from the browser with CORS configured.
 */
function shouldPreferSameOriginProxy(envUrl) {
  if (import.meta.env.DEV) return false;
  if (import.meta.env.VITE_API_DIRECT === "true") return false;
  if (!envUrl || !/^https:\/\//i.test(envUrl)) return false;
  try {
    const host = new URL(normalizeRemoteApiBase(envUrl)).hostname;
    if (!isRenderHost(host)) return false;
    if (typeof window === "undefined") return false;
    return window.location.hostname !== host;
  } catch {
    return false;
  }
}

/**
 * Production on Vercel: use same-origin `/api` (serverless proxy → Render). Set RENDER_API_URL on Vercel.
 * Dev: Vite proxies `/api` → http://localhost:3001 (see vite.config.js).
 * Optional: VITE_API_URL=https://your-render.onrender.com (with or without /api — we normalize).
 */
function resolveApiBaseURL() {
  const env = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV) {
    if (!env) return "/api";
    if (/^https:\/\//i.test(env) && !/localhost|127\.0\.0\.1/i.test(env)) {
      return normalizeRemoteApiBase(env);
    }
    return env;
  }
  if (env && /^https:\/\//i.test(env) && !/localhost|127\.0\.0\.1/i.test(env)) {
    if (shouldPreferSameOriginProxy(env)) return "/api";
    return normalizeRemoteApiBase(env);
  }
  return "/api";
}

const api = axios.create({
  baseURL: resolveApiBaseURL()
});

function isLikelyJsonParseError(err) {
  if (!err) return false;
  const message = String(err.message || "");
  return /JSON\.parse|Unexpected end of JSON input|unexpected end of data/i.test(message);
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("zweck_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (isLikelyJsonParseError(err)) {
      return Promise.reject(
        new Error(
          "The server returned an empty/invalid response. This is usually a proxy or CORS issue. " +
            "If using Vercel, check RENDER_API_URL and try direct API mode temporarily."
        )
      );
    }

    const status = err?.response?.status;
    if (status === 401) {
      localStorage.removeItem("zweck_token");
      if (!authDisabled) {
        if (!window.location.pathname.startsWith("/login")) {
          window.location.replace("/login");
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;

