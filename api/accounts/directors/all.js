/**
 * Vercel proxy for `/api/accounts/directors/all`.
 * The general `/api/accounts/[...path]` catch-all only forwards the first segment
 * reliably on this deployment, so we proxy this specific route used by the dashboard.
 */

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

  const target = `${base}/api/accounts/directors/all`;

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

  // This route is GET in the app; ignore body forwarding for safety.
  const r = await fetch(target, {
    method: req.method,
    headers
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

