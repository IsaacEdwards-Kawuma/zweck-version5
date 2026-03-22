/**
 * Vercel Node serverless proxy (repo root): same-origin https://…/api/* → Render.
 * Use when the Vercel project root is the repository root (not `client/`).
 * Set RENDER_API_URL (e.g. https://your-api.onrender.com) — no /api suffix.
 * Node runtime so POST + JSON bodies forward reliably.
 *
 * For Root Directory = `client`, use `client/api/[...path].js` instead.
 */

async function getBodyBuffer(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body.length ? req.body : undefined;
    if (typeof req.body === "string") return Buffer.from(req.body);
    if (typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  return buf.length ? buf : undefined;
}

/**
 * @param {import('http').IncomingMessage & { query?: Record<string, string | string[] | undefined> }} req
 */
function resolveFullUrl(req) {
  const raw = req.url || "";
  if (raw.startsWith("/api")) return raw;
  const q = req.query?.path;
  if (q !== undefined) {
    const seg = Array.isArray(q) ? q.join("/") : String(q);
    const qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
    return `/api/${seg}${qs}`;
  }
  if (raw.startsWith("/") && raw !== "/") {
    return `/api${raw}`;
  }
  return raw;
}

export default async function handler(req, res) {
  const fullUrl = resolveFullUrl(req);
  if (!fullUrl.startsWith("/api")) {
    res.status(404).send("Not found");
    return;
  }

  const base = process.env.RENDER_API_URL?.replace(/\/$/, "").replace(/\/api$/i, "");
  if (!base) {
    res.status(500).json({
      error: true,
      message:
        "RENDER_API_URL is not set on Vercel. Project → Settings → Environment Variables → e.g. https://your-service.onrender.com (no trailing slash)."
    });
    return;
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = new URL(fullUrl, `${proto}://${host}`);
  const target = `${base}${url.pathname}${url.search}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") continue;
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const bodyBuf = await getBodyBuffer(req);

  const r = await fetch(target, {
    method: req.method,
    headers,
    body: bodyBuf
  });

  res.status(r.status);
  r.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}

export const config = {
  maxDuration: 30
};
