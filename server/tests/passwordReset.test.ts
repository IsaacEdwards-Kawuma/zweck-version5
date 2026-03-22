import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

/** Mirrors server auth route hashing for reset tokens */
function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

describe("password reset token hash", () => {
  it("is deterministic sha256 hex", () => {
    const h = hashResetToken("test-token");
    expect(h).toHaveLength(64);
    expect(h).toBe(createHash("sha256").update("test-token", "utf8").digest("hex"));
  });
});
