import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { findFirstMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn()
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: findFirstMock
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
});
