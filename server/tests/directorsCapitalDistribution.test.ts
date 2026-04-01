import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const prismaMocks = vi.hoisted(() => ({
  directorFindUnique: vi.fn(),
  txCreate: vi.fn(),
  batchCreate: vi.fn(),
  receiptCreate: vi.fn(),
  distCreate: vi.fn(),
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
  allocateNextDirectorReceiptReference: vi.fn(async () => "WDR-TEST-0001")
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

describe("POST /api/transactions (DIRECTORS_CAPITAL_DISTRIBUTION)", () => {
  it("posts distribution as capital→clearing and clearing→bank; creates DirectorDistribution", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);

    prismaMocks.txOuter.mockImplementation(async (fn: any) => {
      const fakeTx: any = {
        directorTransactionBatch: { create: prismaMocks.batchCreate.mockResolvedValue({ id: 10 }) },
        transaction: {
          create: prismaMocks.txCreate
            .mockResolvedValueOnce({ id: 9001 })
            .mockResolvedValueOnce({ id: 9002 })
        },
        directorDistribution: { create: prismaMocks.distCreate.mockResolvedValue({ id: 55 }) },
        directorReceiptLegacy: { create: prismaMocks.receiptCreate.mockResolvedValue({ id: 77 }) },
        auditLog: { create: prismaMocks.auditCreate.mockResolvedValue({ id: 1 }) },
        documentRegister: { create: prismaMocks.docCreate.mockResolvedValue({ id: 1 }) }
      };
      return fn(fakeTx);
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "DIRECTORS_CAPITAL_DISTRIBUTION",
      directorId: 7,
      currency: "EUR",
      amount: 250,
      date: new Date().toISOString(),
      description: "Board-approved capital distribution"
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("referenceNumber");

    expect(prismaMocks.txCreate).toHaveBeenCalledTimes(2);
    const first = prismaMocks.txCreate.mock.calls[0]?.[0]?.data;
    const second = prismaMocks.txCreate.mock.calls[1]?.[0]?.data;

    expect(first.type).toBe("DIRECTORS_CAPITAL_DISTRIBUTION");
    expect(first.manualDebitAccountKey).toBe("director_capital_7");
    expect(first.manualCreditAccountKey).toBe("director_capital_distributions_clearing_7");

    expect(second.type).toBe("DIRECTORS_CAPITAL_DISTRIBUTION");
    expect(second.manualDebitAccountKey).toBe("director_capital_distributions_clearing_7");
    expect(second.manualCreditAccountKey).toBe("bank_eur");

    expect(prismaMocks.distCreate).toHaveBeenCalledTimes(1);
    const distArg = prismaMocks.distCreate.mock.calls[0]?.[0]?.data;
    expect(distArg.directorId).toBe(7);
    expect(distArg.transactionId).toBe(9002);
    expect(String(distArg.status)).toBe("OPEN");
  });
});

