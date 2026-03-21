/**
 * Vercel Edge proxy: browser calls same-origin https://…/api/* → this forwards to Render.
 * Set RENDER_API_URL in Vercel (e.g. https://your-api.onrender.com) — no /api suffix.
 * Avoids mixed content (HTTPS page → http://localhost) and CORS from the browser to Render.
 */
export const config = { runtime: "edge" };

export default async function handler(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api")) {
    return new Response("Not found", { status: 404 });
  }

  const base = process.env.RENDER_API_URL?.replace(/\/$/, "");
  if (!base) {
    return new Response(
      JSON.stringify({
        error: true,
        message:
          "RENDER_API_URL is not set on Vercel. Add it under Project → Settings → Environment Variables: your Render base URL, e.g. https://your-service.onrender.com (no trailing slash)."
      }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const target = `${base}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const r = await fetch(target, init);
  return new Response(r.body, {
    status: r.status,
    statusText: r.statusText,
    headers: r.headers
  });
}
