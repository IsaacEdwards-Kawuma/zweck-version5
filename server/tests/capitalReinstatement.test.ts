import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const prismaMocks = vi.hoisted(() => ({
  directorFindUnique: vi.fn(),
  distFindUnique: vi.fn(),
  txCreate: vi.fn(),
  batchCreate: vi.fn(),
  receiptCreate: vi.fn(),
  distUpdate: vi.fn(),
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
    directorDistribution: { findUnique: prismaMocks.distFindUnique },
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

describe("POST /api/transactions (CAPITAL_REINSTATEMENT)", () => {
  it("blocks when amount exceeds outstanding balance", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);
    prismaMocks.distFindUnique.mockResolvedValue({
      id: 99,
      directorId: 7,
      totalAmount: 250,
      outstandingBalance: 100,
      status: "OPEN",
      currency: "EUR",
      distributionDate: new Date("2026-01-01T00:00:00.000Z")
    } as any);

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "CAPITAL_REINSTATEMENT",
      directorId: 7,
      distributionId: 99,
      currency: "EUR",
      amount: 100.01,
      date: new Date().toISOString()
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", true);
    expect(res.body.field).toBe("amount");
  });

  it("posts reinstatement and updates distribution outstanding balance/status", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);
    prismaMocks.distFindUnique.mockResolvedValue({
      id: 99,
      directorId: 7,
      totalAmount: 250,
      outstandingBalance: 100,
      status: "OPEN",
      currency: "EUR",
      distributionDate: new Date("2026-01-01T00:00:00.000Z")
    } as any);

    prismaMocks.txOuter.mockImplementation(async (fn: any) => {
      const fakeTx: any = {
        directorTransactionBatch: { create: prismaMocks.batchCreate.mockResolvedValue({ id: 10 }) },
        transaction: {
          create: prismaMocks.txCreate
            .mockResolvedValueOnce({ id: 9001 })
            .mockResolvedValueOnce({ id: 9002 })
        },
        directorDistribution: { update: prismaMocks.distUpdate.mockResolvedValue({ id: 99 }) },
        directorReceiptLegacy: { create: prismaMocks.receiptCreate.mockResolvedValue({ id: 77 }) },
        auditLog: { create: prismaMocks.auditCreate.mockResolvedValue({ id: 1 }) },
        documentRegister: { create: prismaMocks.docCreate.mockResolvedValue({ id: 1 }) }
      };
      return fn(fakeTx);
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "CAPITAL_REINSTATEMENT",
      directorId: 7,
      distributionId: 99,
      currency: "EUR",
      amount: 100,
      date: new Date().toISOString(),
      description: "Reinstatement payment"
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("referenceNumber");

    // Two legs: bank->capital then clearing->capital
    expect(prismaMocks.txCreate).toHaveBeenCalledTimes(2);
    const first = prismaMocks.txCreate.mock.calls[0]?.[0]?.data;
    const second = prismaMocks.txCreate.mock.calls[1]?.[0]?.data;

    expect(first.manualDebitAccountKey).toBe("bank_eur");
    expect(first.manualCreditAccountKey).toBe("director_capital_7");

    expect(second.manualDebitAccountKey).toBe("director_capital_distributions_clearing_7");
    expect(second.manualCreditAccountKey).toBe("director_capital_7");

    expect(prismaMocks.distUpdate).toHaveBeenCalledTimes(1);
    const upd = prismaMocks.distUpdate.mock.calls[0]?.[0];
    expect(upd.where.id).toBe(99);
    expect(String(upd.data.status)).toBe("FULLY_REINSTATED");
  });
});

