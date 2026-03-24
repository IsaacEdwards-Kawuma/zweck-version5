import { describe, it, expect } from "vitest";
import { buildPortfolioSplit } from "../src/routes/portfolio.js";

describe("buildPortfolioSplit", () => {
  it("includes bank and active projects with positive values", () => {
    const split = buildPortfolioSplit(1200, [
      {
        id: 1,
        code: "PRJ-1",
        name: "Field Ops",
        budgetSpent: 300,
        tasks: [{ actualCost: 50 }]
      },
      {
        id: 2,
        code: "PRJ-2",
        name: "Back Office",
        budgetSpent: null,
        tasks: [{ actualCost: 90 }, { actualCost: 10 }]
      },
      {
        id: 3,
        code: "PRJ-3",
        name: "Zero",
        budgetSpent: 0,
        tasks: []
      }
    ]);

    expect(split).toEqual([
      { key: "bank", name: "Bank", value: 1200 },
      { key: "project-1", name: "PRJ-1 · Field Ops", value: 300 },
      { key: "project-2", name: "PRJ-2 · Back Office", value: 100 }
    ]);
  });
});

