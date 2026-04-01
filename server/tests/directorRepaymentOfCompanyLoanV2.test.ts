import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const prismaMocks = vi.hoisted(() => ({
  directorFindUnique: vi.fn(),
  loanFindUnique: vi.fn(),
  txCreate: vi.fn(),
  batchCreate: vi.fn(),
  repayCreate: vi.fn(),
  loanUpdate: vi.fn(),
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
    directorCompanyLoan: { findUnique: prismaMocks.loanFindUnique },
    directorReceiptLegacy: { findUnique: vi.fn(async () => ({ id: 1 })) },
    $transaction: prismaMocks.txOuter
  }
}));

vi.mock("../src/lib/directorReferenceNumbers.js", () => ({
  allocateNextDirectorReceiptReference: vi.fn(async () => "CLR-TEST-0001")
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

describe("POST /api/transactions (DIRECTOR_REPAYMENT_OF_COMPANY_LOAN)", () => {
  it("blocks when principal exceeds outstanding balance", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);
    prismaMocks.loanFindUnique.mockResolvedValue({
      id: 99,
      directorId: 7,
      outstandingBalance: 100,
      totalInterestPaid: 0,
      principalAmount: 250,
      status: "OPEN"
    } as any);

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN",
      directorId: 7,
      loanId: 99,
      currency: "EUR",
      amount: 120,
      principalAmount: 120,
      date: new Date().toISOString()
    });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("principalAmount");
  });

  it("posts cash receipt + allocations and updates DirectorCompanyLoan", async () => {
    prismaMocks.directorFindUnique.mockResolvedValue({ id: 7 } as any);
    prismaMocks.loanFindUnique.mockResolvedValue({
      id: 99,
      directorId: 7,
      outstandingBalance: 100,
      totalInterestPaid: 0,
      principalAmount: 250,
      status: "OPEN"
    } as any);

    prismaMocks.txOuter.mockImplementation(async (fn: any) => {
      const fakeTx: any = {
        directorTransactionBatch: { create: prismaMocks.batchCreate.mockResolvedValue({ id: 10 }) },
        transaction: {
          create: prismaMocks.txCreate
            .mockResolvedValueOnce({ id: 9001 }) // cash in
            .mockResolvedValueOnce({ id: 9002 }) // interest alloc
            .mockResolvedValueOnce({ id: 9003 }) // principal settle
        },
        directorLoanRepayment: { create: prismaMocks.repayCreate.mockResolvedValue({ id: 55 }) },
        directorCompanyLoan: { update: prismaMocks.loanUpdate.mockResolvedValue({ id: 99 }) },
        directorReceiptLegacy: { create: prismaMocks.receiptCreate.mockResolvedValue({ id: 77 }) },
        auditLog: { create: prismaMocks.auditCreate.mockResolvedValue({ id: 1 }) },
        documentRegister: { create: prismaMocks.docCreate.mockResolvedValue({ id: 1 }) }
      };
      return fn(fakeTx);
    });

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const res = await request(app).post("/api/transactions").send({
      type: "DIRECTOR_REPAYMENT_OF_COMPANY_LOAN",
      directorId: 7,
      loanId: 99,
      currency: "EUR",
      amount: 120,
      principalAmount: 100,
      interestAmount: 20,
      date: new Date().toISOString()
    });

    expect(res.status).toBe(201);
    expect(prismaMocks.txCreate).toHaveBeenCalledTimes(3);

    const cash = prismaMocks.txCreate.mock.calls[0]?.[0]?.data;
    expect(cash.manualDebitAccountKey).toBe("bank_eur");
    expect(cash.manualCreditAccountKey).toBe("side_fund");
    expect(Number(cash.amount)).toBeCloseTo(120);

    const interestAlloc = prismaMocks.txCreate.mock.calls[1]?.[0]?.data;
    expect(interestAlloc.manualDebitAccountKey).toBe("side_fund");
    expect(interestAlloc.manualCreditAccountKey).toBe("income_interest");
    expect(Number(interestAlloc.amount)).toBeCloseTo(20);

    const principalSettle = prismaMocks.txCreate.mock.calls[2]?.[0]?.data;
    expect(principalSettle.manualDebitAccountKey).toBe("side_fund");
    expect(principalSettle.manualCreditAccountKey).toBe("director_loans_receivable_7");
    expect(Number(principalSettle.amount)).toBeCloseTo(100);

    expect(prismaMocks.loanUpdate).toHaveBeenCalledTimes(1);
    const upd = prismaMocks.loanUpdate.mock.calls[0]?.[0]?.data;
    expect(String(upd.status)).toBe("FULLY_REPAID");
  });
});

