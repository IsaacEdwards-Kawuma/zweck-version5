import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { findFirstMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn()
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: findFirstMock
    },
    meeting: {
      create: vi.fn().mockResolvedValue({ id: 101, title: "T", date: "2026-03-24" }),
      update: vi.fn().mockResolvedValue({ id: 101, title: "T2", date: "2026-03-24" }),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ id: 101, title: "T", date: "2026-03-24" })
    },
    documentRegister: {
      create: vi.fn().mockResolvedValue({ id: 201, title: "Doc" }),
      update: vi.fn().mockResolvedValue({ id: 201, title: "Doc2" }),
      delete: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ id: 201, title: "Doc" })
    },
    reconciliationNote: {
      upsert: vi
        .fn()
        .mockResolvedValue({ id: 301, periodFrom: "2026-03-01", statementDate: "2026-03-31", notes: "x", clearedMap: {} })
    },
    loginEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 1,
          userId: 2,
          success: true,
          ip: "127.0.0.1",
          userAgent: "vitest",
          createdAt: new Date().toISOString()
        }
      ])
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 1 })
    }
  }
}));

describe("workspace RBAC", () => {
  beforeEach(() => {
    process.env.AUTH_DISABLED = "true";
    findFirstMock.mockReset();
    findFirstMock.mockResolvedValue({
      id: 2,
      email: "user@example.com",
      role: "USER",
      directorId: null
    });
  });

  it("rejects USER write to meetings/documents/reconciliation", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const m = await request(app).post("/api/meetings").send({ title: "T", date: "2026-03-24" });
    expect(m.status).toBe(403);

    const d = await request(app).post("/api/documents").send({ title: "Doc" });
    expect(d.status).toBe(403);

    const r = await request(app).put("/api/reconciliation").send({
      periodFrom: "2026-03-01",
      statementDate: "2026-03-31",
      notes: "x",
      clearedMap: {}
    });
    expect(r.status).toBe(403);
  });

  it("allows ADMIN write to meetings/documents/reconciliation", async () => {
    findFirstMock.mockResolvedValue({
      id: 1,
      email: "admin@example.com",
      role: "ADMIN",
      directorId: null
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const m = await request(app).post("/api/meetings").send({ title: "T", date: "2026-03-24" });
    expect(m.status).toBe(201);

    const d = await request(app).post("/api/documents").send({ title: "Doc" });
    expect(d.status).toBe(201);

    const r = await request(app).put("/api/reconciliation").send({
      periodFrom: "2026-03-01",
      statementDate: "2026-03-31",
      notes: "x",
      clearedMap: {}
    });
    expect(r.status).toBe(200);
  });

  it("allows USER self login-events and blocks USER admin login-events endpoint", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const mine = await request(app).get("/api/users/me/login-events");
    expect(mine.status).toBe(200);

    const adminOnly = await request(app).get("/api/users/login-events/all");
    expect(adminOnly.status).toBe(403);
  });

  it("allows ADMIN login-events endpoint", async () => {
    findFirstMock.mockResolvedValue({
      id: 1,
      email: "admin@example.com",
      role: "ADMIN",
      directorId: null
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app).get("/api/users/login-events/all");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
