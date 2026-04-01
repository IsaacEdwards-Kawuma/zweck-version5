import { describe, it, expect, vi } from "vitest";
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

vi.mock("../src/services/inAppNotifications.js", () => ({
  notifyUser: vi.fn(async () => undefined)
}));

vi.mock("../src/lib/directorReceiptPdfJob.js", () => ({
  generateDirectorReceiptPdfNow: vi.fn(async () => undefined)
}));

vi.mock("../src/lib/directorReceiptPdfJobV2.js", () => ({
  generateDirectorReceiptPdfForReferenceV2: vi.fn(async () => undefined)
}));

describe("POST /api/transactions (SUPPLEMENTARY_CAPITAL_CONTRIBUTION)", () => {
  it("posts a single transaction (no side fund split)", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 1 } as any);
    prismaMocks.txOuter.mockImplementation(async (fn: any) => {
      const fakeTx: any = {
        directorTransactionBatch: { create: prismaMocks.batchCreate.mockResolvedValue({ id: 10 }) },
        transaction: { create: prismaMocks.txCreate.mockResolvedValue({ id: 99 }) },
        directorReceiptLegacy: { create: prismaMocks.receiptCreate.mockResolvedValue({ id: 77 }) },
        directorReceipt: { create: vi.fn(async () => ({ id: 88 })) },
        auditLog: { create: prismaMocks.auditCreate.mockResolvedValue({ id: 1 }) },
        documentRegister: { create: prismaMocks.docCreate.mockResolvedValue({ id: 1 }) }
      };
      return fn(fakeTx);
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "SUPPLEMENTARY_CAPITAL_CONTRIBUTION",
      directorId: 1,
      currency: "EUR",
      amount: 123.45,
      date: new Date().toISOString(),
      description: "Extra capital top-up"
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("referenceNumber");

    // Ensure the posting engine created exactly one Transaction row for this receipt.
    expect(prismaMocks.txCreate).toHaveBeenCalledTimes(1);
    const arg = prismaMocks.txCreate.mock.calls[0]?.[0];
    expect(arg?.data?.type).toBe("SUPPLEMENTARY_CAPITAL_CONTRIBUTION");
    expect(Number(arg?.data?.amount)).toBeCloseTo(123.45);
  });
});

