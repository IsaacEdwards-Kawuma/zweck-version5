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

export async function fetchPdfBlob(apiPath) {
  const res = await api.get(apiPath, { responseType: "blob" });
  return res.data;
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

/** Director receipt PDF route is behind JWT; uploads under /api/uploads are served without auth on the API. */
export function needsAuthenticatedReceiptPdfBlob(storedUrl) {
  if (!storedUrl) return false;
  const s = String(storedUrl);
  return /\/director-receipts\/[^/]+\/pdf/i.test(s);
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
