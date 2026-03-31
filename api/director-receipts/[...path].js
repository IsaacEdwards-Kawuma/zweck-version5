/**
 * Vercel proxy for `/api/director-receipts/*` (e.g. `/:id/pdf`).
 * Same rationale as `api/accounts/[...path].js`: the repo-root catch-all
 * `api/[...path].js` does not reliably preserve multi-segment paths on Vercel,
 * which led to edge NOT_FOUND or wrong upstream paths for PDF GETs.
 */

import { forwardToRender } from "../_renderProxy.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60
};

export default async function handler(req, res) {
  const q = req.query?.path;
  const seg = Array.isArray(q) ? q.join("/") : q;
  const renderPath = seg ? `/api/director-receipts/${seg}` : "/api/director-receipts";
  return forwardToRender(req, res, renderPath);
}
