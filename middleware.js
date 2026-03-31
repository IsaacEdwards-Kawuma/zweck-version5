/**
 * Vercel Edge Middleware: proxy all /api/* to Render.
 *
 * Node serverless files under /api often fail to match multi-segment paths
 * (Vercel edge NOT_FOUND / fra1). This runs first and forwards the full path
 * and headers (including Authorization) to RENDER_API_URL.
 *
 * Set on Vercel (Production + Preview): RENDER_API_URL=https://your-service.onrender.com
 * (no /api suffix). If unset, this middleware skips and Node `api/` handlers run instead.
 * Local `npm run dev` uses Vite proxy and does not use this file.
 */

function resolveRenderBaseUrl() {
  const raw =
    process.env.RENDER_API_URL?.trim() ||
    process.env.VERCEL_RENDER_API_URL?.trim() ||
    "";
  if (!raw) return "";
  return raw.replace(/\/$/, "").replace(/\/api$/i, "");
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const normalized = resolveRenderBaseUrl();
  // Without a backend URL, do not block the request — fall through to Node `api/` routes.
  if (!normalized) {
    return;
  }

  const target = `${normalized}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  // Some edge runtimes drop Authorization when cloning Headers; set explicitly.
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);

  /** @type {RequestInit} */
  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    const buf = await request.arrayBuffer();
    init.body = buf.byteLength ? buf : undefined;
  }

  return fetch(target, init);
}

export const config = {
  matcher: ["/api", "/api/:path*"]
};
