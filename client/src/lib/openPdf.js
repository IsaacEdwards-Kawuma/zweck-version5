import api from "../api/client";

/**
 * Stored document URLs may be `/api/...` or full `https://host/api/...` (e.g. from dev or S3).
 * Axios `api` uses `baseURL` `/api`, so we need a path like `/director-receipts/1/pdf`.
 */
export function storedUrlToApiPath(storedUrl) {
  if (!storedUrl || typeof storedUrl !== "string") return null;
  const t = storedUrl.trim();
  if (!t) return null;
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      let p = u.pathname + (u.search || "");
      if (p.startsWith("/api")) p = p.slice("/api".length) || "/";
      return p;
    }
    if (t.startsWith("/api")) return t.slice("/api".length) || "/";
    if (t.startsWith("/")) return t;
    return `/${t}`;
  } catch {
    return null;
  }
}

function revokeLater(url) {
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }, 60_000);
}

/** Match `client/src/api/client.js` — Render base must end with `/api`. */
function normalizeRemoteApiBase(url) {
  let u = url.replace(/\/+$/, "");
  if (!u.endsWith("/api")) u = `${u}/api`;
  return u;
}

async function blobHasPdfHeader(blob) {
  if (!blob || blob.size === 0) return false;
  const head = await blob.slice(0, 5).arrayBuffer();
  const sig = new Uint8Array(head);
  return sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46;
}

/**
 * When Vercel’s /api proxy returns 404 or an HTML error page, call Render directly.
 * Requires `VITE_API_URL=https://…onrender.com` at build time and CORS (ALLOWED_ORIGINS) on the API.
 */
async function fetchPdfBlobDirect(apiPath) {
  const env = import.meta.env.VITE_API_URL?.trim();
  if (!env || !/^https:\/\//i.test(env)) return null;
  const base = normalizeRemoteApiBase(env);
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const token = localStorage.getItem("zweck_token");
  const r = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!r.ok) throw new Error(`PDF request failed (${r.status})`);
  return await r.blob();
}

export async function fetchPdfBlob(apiPath) {
  let blob;
  let axiosErr;
  try {
    const res = await api.get(apiPath, { responseType: "blob" });
    blob = res.data;
  } catch (err) {
    if (err?.response?.status === 404) axiosErr = err;
    else throw err;
  }
  if (axiosErr) {
    const direct = await fetchPdfBlobDirect(apiPath);
    if (direct) blob = direct;
    else throw axiosErr;
  }
  if (blob && (await blobHasPdfHeader(blob))) return blob;
  const direct = await fetchPdfBlobDirect(apiPath);
  if (direct && (await blobHasPdfHeader(direct))) return direct;
  throw new Error(
    "Could not load PDF (response was not a PDF). Check Vercel proxy routes and RENDER_API_URL, or set VITE_API_URL for direct API fallback with CORS."
  );
}

/** Open PDF in a new tab (authenticated — works on Vercel same-origin proxy). */
export async function openPdfInNewTab(apiPath) {
  const blob = await fetchPdfBlob(apiPath);
  const url = URL.createObjectURL(blob);
  revokeLater(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Trigger browser print dialog for the PDF (best-effort across viewers). */
export async function printPdfInNewTab(apiPath) {
  const blob = await fetchPdfBlob(apiPath);
  const url = URL.createObjectURL(blob);
  revokeLater(url);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) return;
  let tries = 0;
  const id = window.setInterval(() => {
    tries += 1;
    try {
      w.focus();
      w.print();
      window.clearInterval(id);
    } catch {
      if (tries >= 12) window.clearInterval(id);
    }
  }, 350);
}

/** Download PDF with a suggested filename. */
export async function downloadPdf(apiPath, filenameBase = "document") {
  const blob = await fetchPdfBlob(apiPath);
  const url = URL.createObjectURL(blob);
  const safe = String(filenameBase).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.pdf`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Director receipt PDF routes are behind JWT (`GET .../pdf`).
 * V1: `/api/director-receipts/:id/pdf`
 * V2: `/api/director-receipts-v2/:id/pdf`
 * Uploads under `/api/uploads/...` are static and must use a normal window open (no bearer token).
 */
export function needsAuthenticatedReceiptPdfBlob(storedUrl) {
  if (!storedUrl) return false;
  const s = String(storedUrl);
  // Allow optional trailing slash and query/hash after `pdf`.
  return /\/director-receipts(?:-v2)?\/[^/]+\/pdf(?:$|[/?#])/i.test(s);
}

export async function openStoredPdfUrl(storedUrl) {
  if (!storedUrl) return;
  if (needsAuthenticatedReceiptPdfBlob(storedUrl)) {
    const p = storedUrlToApiPath(storedUrl);
    if (!p) return;
    await openPdfInNewTab(p);
    return;
  }
  if (/^https?:\/\//i.test(storedUrl)) {
    window.open(storedUrl, "_blank", "noopener,noreferrer");
    return;
  }
  window.open(storedUrl, "_blank", "noopener,noreferrer");
}

export async function printStoredPdfUrl(storedUrl) {
  if (!storedUrl) return;
  if (needsAuthenticatedReceiptPdfBlob(storedUrl)) {
    const p = storedUrlToApiPath(storedUrl);
    if (!p) return;
    await printPdfInNewTab(p);
    return;
  }
  const w = window.open(storedUrl, "_blank", "noopener,noreferrer");
  if (!w) return;
  let tries = 0;
  const id = window.setInterval(() => {
    tries += 1;
    try {
      w.focus();
      w.print();
      window.clearInterval(id);
    } catch {
      if (tries >= 12) window.clearInterval(id);
    }
  }, 400);
}

export async function downloadStoredPdfUrl(storedUrl, filenameBase = "document") {
  if (!storedUrl) return;
  if (needsAuthenticatedReceiptPdfBlob(storedUrl)) {
    const p = storedUrlToApiPath(storedUrl);
    if (!p) return;
    await downloadPdf(p, filenameBase);
    return;
  }
  window.open(storedUrl, "_blank", "noopener,noreferrer");
}
