import "dotenv/config";
import cors from "cors";
import express from "express";
import { buildCorsOptions } from "./lib/cors.js";
import { apiError } from "./lib/http.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import transactionsRoutes from "./routes/transactions.js";
import accountsRoutes from "./routes/accounts.js";
import directorsRoutes from "./routes/directors.js";
import portfolioRoutes from "./routes/portfolio.js";
import mmfRoutes from "./routes/mmf.js";
import circulationRoutes from "./routes/circulation.js";
import usersRoutes from "./routes/users.js";

const app = express();

const corsOptions = buildCorsOptions();

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);

app.use("/api", requireAuth);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/accounts", accountsRoutes);
app.use("/api/directors", directorsRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/mmf", mmfRoutes);
app.use("/api/circulation", circulationRoutes);
app.use("/api/users", usersRoutes);

app.use((_req, res) => res.status(404).json(apiError("Not found")));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  return res.status(500).json(apiError("Internal server error"));
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`ZweckOS API listening on ${host}:${port}`);
});

