/**
 * Vercel proxy for `/api/director-receipts/*` when Root Directory = `client`.
 * See repo-root `api/director-receipts/[...path].js` for rationale.
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
