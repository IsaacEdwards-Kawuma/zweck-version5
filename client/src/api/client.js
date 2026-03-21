import axios from "axios";

const authDisabled = import.meta.env.VITE_AUTH_DISABLED === "true";

/**
 * Production on Vercel: use same-origin `/api` (Edge proxy → Render). Set RENDER_API_URL on Vercel.
 * Dev: Vite proxies `/api` → http://localhost:3001 (see vite.config.js).
 * Optional: VITE_API_URL=https://your-render.onrender.com/api to call Render directly (HTTPS only).
 */
function resolveApiBaseURL() {
  const env = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV) {
    return env || "/api";
  }
  if (env && /^https:\/\//i.test(env) && !/localhost|127\.0\.0\.1/i.test(env)) {
    return env;
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
      if (!window.location.pathname.startsWith("/login")) window.location.replace("/login");
    }
    return Promise.reject(err);
  }
);

export default api;

