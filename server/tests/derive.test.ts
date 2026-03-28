import { describe, it, expect } from "vitest";
import { deriveBalances } from "../src/lib/derive.js";

describe("deriveBalances", () => {
  it("debits bank and credits director capital for a contribution", () => {
    const balances = deriveBalances([
      {
        type: "CONTRIBUTION",
        amount: 100,
        currency: "EUR",
        directorId: 1,
        postingStatus: "POSTED"
      }
    ] as any);

    expect(balances.bank_eur).toBeCloseTo(100);
    expect(balances.capital).toBeCloseTo(0);
    expect(balances.director_capital_1).toBeCloseTo(-100);
  });

  it("nets to zero when original is REVERSED and a reversal row is posted", () => {
    const balances = deriveBalances([
      {
        type: "CONTRIBUTION",
        amount: 160,
        currency: "EUR",
        directorId: 1,
        postingStatus: "REVERSED"
      },
      {
        type: "CONTRIBUTION",
        amount: 160,
        currency: "EUR",
        directorId: 1,
        postingStatus: "POSTED",
        reversalOfId: 1
      }
    ] as any);

    expect(balances.bank_eur).toBeCloseTo(0);
    expect(balances.director_capital_1).toBeCloseTo(0);
  });
});
