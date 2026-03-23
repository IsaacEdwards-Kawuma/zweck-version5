import { forwardToRender } from "../_renderProxy.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 30
};

export default async function handler(req, res) {
  return forwardToRender(req, res, "/api/auth/me");
}

