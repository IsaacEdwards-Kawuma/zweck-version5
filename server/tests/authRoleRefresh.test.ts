import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { verifyMock, findUniqueMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  findUniqueMock: vi.fn()
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    verify: verifyMock
  }
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock
    }
  }
}));

import { requireAuth } from "../src/middleware/auth.js";

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("requireAuth role refresh", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.AUTH_DISABLED = "false";
    verifyMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("loads current role from DB, not token payload role", async () => {
    const req = {
      headers: { authorization: "Bearer token" }
    } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    verifyMock.mockReturnValue({
      id: 7,
      email: "old@example.com",
      role: "USER",
      directorId: null
    });
    findUniqueMock.mockResolvedValue({
      id: 7,
      email: "new@example.com",
      role: "ADMIN",
      directorId: 4,
      deletedAt: null,
      isActive: true,
      adminBlockedAt: null
    });

    requireAuth(req, res, next);
    await Promise.resolve();
    await Promise.resolve();

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      id: 7,
      email: "new@example.com",
      role: "ADMIN",
      directorId: 4
    });
  });
});

