import { forwardToRender } from "../_renderProxy.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30
};

export default async function handler(req, res) {
  // For this function, the incoming URL is:
  //   /api/accounts/<path segments...>
  // Vercel passes the catch-all as req.query.path (string or string[]).
  const q = req.query?.path;
  const seg = Array.isArray(q) ? q.join("/") : q;
  const renderPath = seg ? `/api/accounts/${seg}` : "/api/accounts";
  return forwardToRender(req, res, renderPath);
}

