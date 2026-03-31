/**
 * Vercel Edge Middleware: proxy all /api/* to Render.
 *
 * Node serverless files under /api often fail to match multi-segment paths
 * (Vercel edge NOT_FOUND / fra1). This runs first and forwards the full path
 * and headers (including Authorization) to RENDER_API_URL.
 *
 * Set on Vercel: RENDER_API_URL=https://your-service.onrender.com (no /api suffix).
 * Local `npm run dev` uses Vite proxy and does not use this file.
 */

export default async function middleware(request) {
  const url = new URL(request.url);
  const base = process.env.RENDER_API_URL?.trim() || "";
  const normalized = base.replace(/\/$/, "").replace(/\/api$/i, "");
  if (!normalized) {
    return new Response(
      JSON.stringify({
        error: true,
        message:
          "RENDER_API_URL is not set. Vercel → Project → Settings → Environment Variables → https://your-service.onrender.com"
      }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
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
