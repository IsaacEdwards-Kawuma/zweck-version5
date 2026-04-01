import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";

const prismaMocks = vi.hoisted(() => ({
  directorFindUnique: vi.fn(),
  txCreate: vi.fn(),
  batchCreate: vi.fn(),
  receiptCreate: vi.fn(),
  auditCreate: vi.fn(),
  docCreate: vi.fn(),
  txOuter: vi.fn()
}));

vi.mock("../src/middleware/auth.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  const setUser = (req: any) => {
    req.user = { id: 1, email: "test@example.com", role: "ADMIN", directorId: null };
  };
  return {
    ...actual,
    requireAuth: (req: any, _res: any, next: any) => {
      setUser(req);
      next();
    },
    requireRole: () => (req: any, _res: any, next: any) => {
      setUser(req);
      next();
    },
    requireTreasurerOrAdmin: (req: any, _res: any, next: any) => {
      setUser(req);
      next();
    },
    requireAdminOrDirectorSelf: () => (req: any, _res: any, next: any) => {
      setUser(req);
      next();
    }
  };
});

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    director: { findUnique: prismaMocks.directorFindUnique },
    directorReceiptLegacy: { findUnique: vi.fn(async () => ({ id: 1 })) },
    $transaction: prismaMocks.txOuter
  }
}));

vi.mock("../src/lib/directorReferenceNumbers.js", () => ({
  allocateNextDirectorReceiptReference: vi.fn(async () => "CCR-TEST-0001")
}));

vi.mock("../src/lib/referenceNumber.js", () => ({
  allocateNextReferenceNumber: vi.fn(async () => "ZWK-TEST-0001"),
  peekNextReferenceNumber: vi.fn(async () => "ZWK-TEST-0002")
}));

vi.mock("../src/lib/directorReceiptPdfJob.js", () => ({
  generateDirectorReceiptPdfNow: vi.fn(async () => undefined)
}));

vi.mock("../src/services/inAppNotifications.js", () => ({
  notifyUser: vi.fn(async () => undefined)
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/transactions (CONTRIBUTION_ARREARS)", () => {
  it("rejects when month range is missing", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 1 } as any);
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "CONTRIBUTION_ARREARS",
      directorId: 1,
      currency: "EUR",
      amount: 50,
      date: new Date().toISOString()
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", true);
    expect(res.body.field).toBe("arrearsFromMonth");
  });

  it("rejects when amount is less than required side fund deduction", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 1 } as any);
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "CONTRIBUTION_ARREARS",
      directorId: 1,
      currency: "EUR",
      amount: 19.99,
      date: new Date().toISOString(),
      arrearsFromMonth: "2026-01",
      arrearsToMonth: "2026-02"
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", true);
    expect(res.body.field).toBe("amount");
    expect(String(res.body.message || "")).toMatch(/at least/i);
  });

  it("accepts when amount covers side fund deduction (months × 10 EUR)", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();

    prismaMocks.directorFindUnique.mockResolvedValue({ id: 1 } as any);
    prismaMocks.txOuter.mockImplementation(async (fn: any) => {
      const fakeTx: any = {
        directorTransactionBatch: { create: prismaMocks.batchCreate.mockResolvedValue({ id: 10 }) },
        transaction: { create: prismaMocks.txCreate.mockResolvedValue({ id: 99 }) },
        directorReceiptLegacy: { create: prismaMocks.receiptCreate.mockResolvedValue({ id: 77 }) },
        auditLog: { create: prismaMocks.auditCreate.mockResolvedValue({ id: 1 }) },
        documentRegister: { create: prismaMocks.docCreate.mockResolvedValue({ id: 1 }) }
      };
      return fn(fakeTx);
    });

    const res = await request(app).post("/api/transactions").send({
      type: "CONTRIBUTION_ARREARS",
      directorId: 1,
      currency: "EUR",
      amount: 20,
      date: new Date().toISOString(),
      arrearsFromMonth: "2026-01",
      arrearsToMonth: "2026-02"
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("referenceNumber");
  });
});

