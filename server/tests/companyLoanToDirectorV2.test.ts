import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const prismaMocks = vi.hoisted(() => ({
  directorFindUnique: vi.fn(),
  txFindMany: vi.fn(),
  txCreate: vi.fn(),
  batchCreate: vi.fn(),
  loanCreate: vi.fn(),
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
    transaction: { findMany: prismaMocks.txFindMany },
    directorReceiptLegacy: { findUnique: vi.fn(async () => ({ id: 1 })) },
    $transaction: prismaMocks.txOuter
  }
}));

vi.mock("../src/lib/directorReferenceNumbers.js", () => ({
  allocateNextDirectorReceiptReference: vi.fn(async () => "CLN-TEST-0001")
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

describe("POST /api/transactions (COMPANY_LOAN_TO_DIRECTOR)", () => {
  it("blocks when Side Fund (3200) balance is insufficient", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);
    prismaMocks.txFindMany.mockResolvedValue([
      // A single side-fund contribution tagged to a director to create a derived 3200 balance.
      { type: "SIDE_FUND", amount: 10, currency: "EUR", directorId: 7, postingStatus: "POSTED" }
    ]);

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "COMPANY_LOAN_TO_DIRECTOR",
      directorId: 7,
      currency: "EUR",
      amount: 50,
      date: new Date().toISOString(),
      loanDate: new Date("2026-02-01T00:00:00.000Z").toISOString(),
      repaymentTerms: "3 months"
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", true);
    expect(res.body.field).toBe("amount");
    expect(String(res.body.message || "")).toMatch(/available side fund/i);
  });

  it("creates DirectorCompanyLoan after posting", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);
    prismaMocks.txFindMany.mockResolvedValue([
      { type: "SIDE_FUND", amount: 1_000, currency: "EUR", directorId: 7, postingStatus: "POSTED" }
    ]);

    prismaMocks.txOuter.mockImplementation(async (fn: any) => {
      const fakeTx: any = {
        directorTransactionBatch: { create: prismaMocks.batchCreate.mockResolvedValue({ id: 10 }) },
        transaction: { create: prismaMocks.txCreate.mockResolvedValue({ id: 9001 }) },
        directorCompanyLoan: { create: prismaMocks.loanCreate.mockResolvedValue({ id: 55 }) },
        directorReceiptLegacy: { create: prismaMocks.receiptCreate.mockResolvedValue({ id: 77 }) },
        auditLog: { create: prismaMocks.auditCreate.mockResolvedValue({ id: 1 }) },
        documentRegister: { create: prismaMocks.docCreate.mockResolvedValue({ id: 1 }) }
      };
      return fn(fakeTx);
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "COMPANY_LOAN_TO_DIRECTOR",
      directorId: 7,
      currency: "EUR",
      amount: 250,
      date: new Date().toISOString(),
      loanDate: new Date("2026-02-01T00:00:00.000Z").toISOString(),
      repaymentTerms: "3 months",
      reason: "Emergency"
    });

    expect(res.status).toBe(201);
    expect(prismaMocks.loanCreate).toHaveBeenCalledTimes(1);
    const arg = prismaMocks.loanCreate.mock.calls[0]?.[0]?.data;
    expect(arg.directorId).toBe(7);
    expect(arg.transactionId).toBe(9001);
    expect(String(arg.status)).toBe("OPEN");
  });
});

