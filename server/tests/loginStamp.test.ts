import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { compareMock, signMock, findUniqueMock, txMock, userUpdateMock, loginEventCreateMock } = vi.hoisted(() => ({
  compareMock: vi.fn(),
  signMock: vi.fn(),
  findUniqueMock: vi.fn(),
  txMock: vi.fn(),
  userUpdateMock: vi.fn(),
  loginEventCreateMock: vi.fn()
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: compareMock
  }
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: signMock
  }
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      update: userUpdateMock
    },
    loginEvent: {
      create: loginEventCreateMock
    },
    $transaction: txMock
  }
}));

describe("login stamp", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    compareMock.mockReset();
    signMock.mockReset();
    findUniqueMock.mockReset();
    txMock.mockReset();
    userUpdateMock.mockReset();
    loginEventCreateMock.mockReset();
  });

  it("writes lastLoginAt and login event on successful login", async () => {
    findUniqueMock.mockResolvedValue({
      id: 10,
      email: "user@example.com",
      password: "hashed",
      role: "USER",
      directorId: null,
      isActive: true,
      deletedAt: null,
      adminBlockedAt: null
    });
    compareMock.mockResolvedValue(true);
    signMock.mockReturnValue("token-123");
    userUpdateMock.mockReturnValue({ op: "update-user" });
    loginEventCreateMock.mockReturnValue({ op: "create-login-event" });
    txMock.mockResolvedValue([]);

    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "vitest-agent")
      .send({ email: "user@example.com", password: "secret123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("token-123");
    expect(txMock).toHaveBeenCalledTimes(1);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { lastLoginAt: expect.any(Date) }
    });
    expect(loginEventCreateMock).toHaveBeenCalledWith({
      data: {
        userId: 10,
        success: true,
        ip: expect.any(String),
        userAgent: "vitest-agent"
      }
    });
  });

  it("writes failed login event when password is wrong", async () => {
    findUniqueMock.mockResolvedValue({
      id: 10,
      email: "user@example.com",
      password: "hashed",
      role: "USER",
      directorId: null,
      isActive: true,
      deletedAt: null,
      adminBlockedAt: null
    });
    compareMock.mockResolvedValue(false);

    const { createApp } = await import("../src/app.js");
    const app = createApp();

    const res = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "vitest-agent")
      .send({ email: "user@example.com", password: "wrong-pass" });

    expect(res.status).toBe(401);
    expect(txMock).not.toHaveBeenCalled();
    expect(loginEventCreateMock).toHaveBeenCalledWith({
      data: {
        userId: 10,
        success: false,
        ip: expect.any(String),
        userAgent: "vitest-agent"
      }
    });
  });
});
