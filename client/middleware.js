/**
 * Same as repo-root `middleware.js` — use when Vercel "Root Directory" is `client`.
 * Proxies /api/* → Render (RENDER_API_URL).
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
