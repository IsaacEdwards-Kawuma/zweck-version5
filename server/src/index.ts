import "dotenv/config";
import "./instrument.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import http from "node:http";
import { setupChatSocket } from "./socket/chatSocket.js";
import { startEmailQueueWorker } from "./services/emailBus.js";

if (process.env.AUTH_DISABLED?.trim() && ["true", "1", "yes"].includes(process.env.AUTH_DISABLED.trim().toLowerCase())) {
  console.warn("[zweck] AUTH_DISABLED is set — JWT checks are bypassed. Do not use in production.");
} else if (!process.env.JWT_SECRET?.trim()) {
  console.warn(
    "[zweck] JWT_SECRET is missing — /api/auth/login and /api/auth/register will fail until you set it in server/.env"
  );
}

const app = createApp();

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";
const httpServer = http.createServer(app);
setupChatSocket(httpServer);
startEmailQueueWorker();

httpServer.listen(port, host, () => {
  logger.info({ host, port }, "ZweckOS API listening");
});
