import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  findFirstUser: vi.fn(),
  docsFindMany: vi.fn(),
  receiptsFindMany: vi.fn()
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findFirst: mocks.findFirstUser },
    documentRegister: { findMany: mocks.docsFindMany },
    directorReceiptLegacy: { findMany: mocks.receiptsFindMany }
  }
}));

describe("documents + director receipts RBAC", () => {
  beforeEach(() => {
    process.env.AUTH_DISABLED = "true";
    mocks.findFirstUser.mockReset();
    mocks.docsFindMany.mockReset();
    mocks.receiptsFindMany.mockReset();
  });

  it("DIRECTOR can list all documents (power tiers removed)", async () => {
    mocks.findFirstUser.mockResolvedValue({
      id: 10,
      email: "director@example.com",
      role: "DIRECTOR",
      directorId: 7
    });

    mocks.docsFindMany.mockResolvedValue([
      { id: 1, title: "Public", confidentiality: null, directorId: null, pinned: false, updatedAt: new Date() },
      { id: 2, title: "InternalUnlinked", confidentiality: "Internal", directorId: null, pinned: false, updatedAt: new Date() },
      { id: 3, title: "MineReceipt", confidentiality: "Internal", directorId: 7, pinned: false, updatedAt: new Date() },
      { id: 4, title: "OtherReceipt", confidentiality: "Internal", directorId: 99, pinned: false, updatedAt: new Date() }
    ]);

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).get("/api/documents");
    expect(res.status).toBe(200);
    const ids = (res.body || []).map((r: any) => r.id).sort();
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it("DIRECTOR can list receipts for another director (power tiers removed)", async () => {
    mocks.findFirstUser.mockResolvedValue({
      id: 10,
      email: "director@example.com",
      role: "DIRECTOR",
      directorId: 7
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).get("/api/director-receipts").query({ directorId: 99 });
    expect(res.status).toBe(200);
    expect(mocks.receiptsFindMany).toHaveBeenCalled();
  });
});

