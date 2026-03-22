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
    return normalizeRemoteApiBase(env);
  }
  return "/api";
}

const api = axios.create({
  baseURL: resolveApiBaseURL()
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("zweck_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && !authDisabled) {
      localStorage.removeItem("zweck_token");
      const p = window.location.pathname;
      if (!p.startsWith("/login") && !p.startsWith("/forgot-password") && !p.startsWith("/reset-password")) {
        window.location.replace("/login");
      }
    }
    return Promise.reject(err);
  }
);

export default api;

