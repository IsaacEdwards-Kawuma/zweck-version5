/**
 * Same as repo-root `api/director-receipts-v2/[id]/pdf.js` when Root Directory = `client`.
 */

import { forwardToRender } from "../../_renderProxy.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60
};

export default async function handler(req, res) {
  const id = req.query?.id;
  if (id === undefined || id === "") {
    res.status(400).json({ error: true, message: "Missing receipt id" });
    return;
  }
  const renderPath = `/api/director-receipts-v2/${id}/pdf`;
  return forwardToRender(req, res, renderPath);
}

