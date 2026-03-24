import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("createApp", () => {
  it("GET /api/health returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
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

  it("GET /api/meetings without auth returns 401", async () => {
    const app = createApp();
    const res = await request(app).get("/api/meetings");
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
});
