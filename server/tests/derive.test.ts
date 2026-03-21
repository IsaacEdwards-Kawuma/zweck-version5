import { describe, it, expect } from "vitest";
import { deriveBalances } from "../src/lib/derive.js";

describe("deriveBalances", () => {
  it("computes balances from transaction types", () => {
    const balances = deriveBalances([
      { type: "CONTRIBUTION", amount: 100 },
      { type: "MMF_DEPLOY", amount: 40 }
    ] as any);

    expect(balances.bank).toBeCloseTo(60); // +100 (CONTRIBUTION) -40 (MMF_DEPLOY)
    expect(balances.capital).toBeCloseTo(-100);
    expect(balances.mmf).toBeCloseTo(40);
  });
});

