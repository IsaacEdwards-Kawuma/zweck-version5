import { describe, it, expect } from "vitest";
import { deriveBalances } from "../src/lib/derive.js";

describe("deriveBalances", () => {
  it("computes balances from transaction types with currency-specific bank and director capital", () => {
    const balances = deriveBalances([
      {
        type: "CONTRIBUTION",
        amount: 100,
        currency: "EUR",
        directorId: 1,
        postingStatus: "POSTED"
      },
      { type: "MMF_DEPLOY", amount: 40, currency: "EUR", postingStatus: "POSTED" }
    ] as any);

    expect(balances.bank_eur).toBeCloseTo(60);
    expect(balances.capital).toBeCloseTo(0);
    expect(balances.director_capital_1).toBeCloseTo(-100);
    expect(balances.mmf).toBeCloseTo(40);
  });
});
