import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createApp", () => {
  it("GET /api/health returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.database).toBe("ok");
    expect(["local", "s3"]).toContain(res.body.avatarStorage);
  });

  it("GET /api/openapi.json returns spec", async () => {
    const app = createApp();
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.info?.title).toBe("ZweckOS API");
  });

  it("GET /api/settings without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("GET /api/notifications without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("GET /api/meetings without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/meetings");
    expect(res.status).toBe(401);
  });

  it("GET /api/meetings/calendar.ics without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/meetings/calendar.ics");
    expect(res.status).toBe(401);
  });

  it("POST /api/integrations/ping without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).post("/api/integrations/ping").send({ test: true });
    expect(res.status).toBe(401);
  });

  it("GET /api/documents without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/documents");
    expect(res.status).toBe(401);
  });

  it("GET /api/reconciliation without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/reconciliation");
    expect(res.status).toBe(401);
  });

  it("POST /api/reports/events without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).post("/api/reports/events").send({
      action: "PRINT",
      statement: "PROFIT_LOSS",
      mode: "summary"
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/jobs/meeting-reminders returns 503 when CRON_SECRET is empty", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const app = createApp();
    const res = await request(app).post("/api/jobs/meeting-reminders");
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/CRON_SECRET/i);
  });

  it("POST /api/jobs/meeting-reminders returns 401 when secret is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "correct-cron-secret");
    const app = createApp();
    const res = await request(app).post("/api/jobs/meeting-reminders").set("X-Cron-Secret", "wrong");
    expect(res.status).toBe(401);
  });

  it("POST /api/jobs/meeting-reminders accepts Authorization Bearer for secret", async () => {
    vi.stubEnv("CRON_SECRET", "correct-cron-secret");
    const app = createApp();
    const res = await request(app)
      .post("/api/jobs/meeting-reminders")
      .set("Authorization", "Bearer correct-cron-secret");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("checked");
    expect(res.body).toHaveProperty("sent");
    expect(res.body).toHaveProperty("skipped");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});
