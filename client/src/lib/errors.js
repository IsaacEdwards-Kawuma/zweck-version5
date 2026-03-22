/**
 * Human-readable message from API failures (Axios), network errors, or thrown values.
 */
function messageFromResponseData(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  const nested = data.error;
  if (nested && typeof nested === "object" && typeof nested.message === "string" && nested.message.trim()) {
    return nested.message;
  }
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  return null;
}

/** Axios baseURL + url for debugging (e.g. POST /api/auth/register). */
function axiosRequestLabel(err) {
  const cfg = err?.config;
  if (!cfg) return "";
  const method = (cfg.method || "GET").toUpperCase();
  const base = typeof cfg.baseURL === "string" ? cfg.baseURL.replace(/\/$/, "") : "";
  const rel = typeof cfg.url === "string" ? cfg.url : "";
  if (!rel) return "";
  const path =
    base && !/^https?:\/\//i.test(rel) ? `${base}${rel.startsWith("/") ? "" : "/"}${rel}` : rel;
  return ` (${method} ${path})`;
}

const FALLBACK_404_VERCEL =
  "Nothing responded for that URL (404). On Vercel: set RENDER_API_URL to your Render API (https://….onrender.com, no /api), leave VITE_API_URL unset so the app uses same-origin /api, redeploy, then open /api/health on your site — it should return JSON with ok: true. " +
  "If /api/health fails too, the proxy is missing or the env var is wrong.";

const NETWORK_FALLBACK =
  "Network error — the browser got no response (often CORS, mixed content, or a bad URL). " +
  "If VITE_API_URL points at Render: add your exact Vercel URL to ALLOWED_ORIGINS on Render, or remove VITE_API_URL and use same-origin /api with RENDER_API_URL on Vercel. " +
  "Do not use http:// for the API on an https:// site. Check DevTools → Network for the failed request.";

export function getApiErrorMessage(err, fallback = "Something went wrong.") {
  if (err == null) return fallback;
  if (typeof err === "string") return err;

  const root = err.cause ?? err;
  const data = root.response?.data;
  const fromData = messageFromResponseData(data);
  if (fromData) return fromData;
  if (typeof data === "string" && data.trim()) return data;

  if (root.code === "ECONNABORTED" || root.message?.includes("timeout")) {
    return "Request timed out. Check your connection and try again.";
  }
  const noResponse = !root.response;
  const isAxiosNetwork =
    noResponse && (root.message === "Network Error" || root.code === "ERR_NETWORK");
  if (isAxiosNetwork) {
    return NETWORK_FALLBACK + axiosRequestLabel(root);
  }
  if (noResponse) {
    return root.message || fallback;
  }

  const status = root.response.status;
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) {
    const m404 = messageFromResponseData(data);
    if (m404) return m404;
    return FALLBACK_404_VERCEL + axiosRequestLabel(root);
  }
  if (status === 409) return messageFromResponseData(data) || "This action conflicts with existing data.";
  if (status >= 500) return "The server had a problem. Try again later.";

  return root.message || fallback;
}
