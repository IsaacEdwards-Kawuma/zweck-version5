/**
 * Vercel Node serverless proxy: same-origin https://…/api/* → Render.
 * Set RENDER_API_URL (e.g. https://your-api.onrender.com) — no /api suffix.
 * Node runtime (not Edge) so POST + JSON bodies forward reliably (avoids 405 on static HTML).
 */

async function getBodyBuffer(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  // Vercel often pre-parses JSON into req.body — stream may be empty if we only read chunks
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

export default async function handler(req, res) {
  if (!req.url?.startsWith("/api")) {
    res.status(404).send("Not found");
    return;
  }

  // Accept either https://host or https://host/api (strip trailing /api to avoid /api/api/... on upstream)
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
  const url = new URL(req.url, `${proto}://${host}`);
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
