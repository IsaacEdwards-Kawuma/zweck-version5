function getRenderBaseUrl() {
  const base = process.env.RENDER_API_URL?.replace(/\/$/, "").replace(/\/api$/i, "");
  return base || null;
}

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

function buildForwardHeaders(req) {
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
  return headers;
}

/**
 * Forwards the request to Render and returns the response body/status to the browser.
 * @param {import('http').IncomingMessage & { body?: any }} req
 * @param {{ status: (code: number) => any; setHeader: (k: string, v: string) => void; end: (body?: any) => void; json: (body: any) => void; }} res
 * @param {string} renderPath e.g. "/api/auth/login"
 */
export async function forwardToRender(req, res, renderPath) {
  const base = getRenderBaseUrl();
  if (!base) {
    res.status(500).json({
      error: true,
      message:
        "RENDER_API_URL is not set on Vercel. Set it to https://your-service.onrender.com (no trailing slash, no /api)."
    });
    return;
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = new URL(renderPath, `${proto}://${host}`);
  const target = `${base}${url.pathname}${url.search}`;

  const headers = buildForwardHeaders(req);
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

