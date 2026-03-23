/**
 * Vercel Node serverless proxy for multi-segment paths under `/api/accounts/*`.
 * This is needed because Vercel's single catch-all (`api/[...path].js`) was only
 * forwarding the first segment reliably (e.g. `/api/accounts` but not `/api/accounts/balances`).
 *
 * Forward to Render:
 * - Env: RENDER_API_URL=https://your-render-host (no `/api` suffix)
 * - Target: `${RENDER_API_URL}${req.url}` (req.url already starts with `/api/...`)
 */

async function getBodyBuffer(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body.length ? req.body : undefined;
    if (typeof req.body === "string") return Buffer.from(req.body);
    if (typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));
  }

  // Some Vercel runtimes don't expose an async-iterable stream.
  if (req && typeof req[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    return buf.length ? buf : undefined;
  }

  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  const base = process.env.RENDER_API_URL?.replace(/\/$/, "").replace(/\/api$/i, "");
  if (!base) {
    res.status(500).json({
      error: true,
      message:
        "RENDER_API_URL is not set on Vercel. Project → Settings → Environment Variables → e.g. https://your-service.onrender.com (no trailing slash, no /api)."
    });
    return;
  }

  const url = new URL(req.url, "http://localhost");
  // req.url already includes the `/api/accounts/...` path.
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
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}

export const config = {
  runtime: "nodejs",
  maxDuration: 30
};

