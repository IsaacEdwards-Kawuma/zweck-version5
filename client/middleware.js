/**
 * Same as repo-root `middleware.js` — use when Vercel "Root Directory" is `client`.
 * Proxies /api/* → Render (RENDER_API_URL).
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
  if (!normalized) {
    return;
  }

  const target = `${normalized}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");

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
