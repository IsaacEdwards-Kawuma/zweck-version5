import { describe, it, expect } from "vitest";
import { rollingMonthKeys, monthlyVolumeSeries, periodComparison30d } from "./dashboardAnalytics";

describe("dashboardAnalytics", () => {
  it("rollingMonthKeys returns 12 keys", () => {
    expect(rollingMonthKeys(12)).toHaveLength(12);
  });

  it("monthlyVolumeSeries buckets amounts", () => {
    const now = new Date();
    const iso = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    const series = monthlyVolumeSeries([{ date: iso, amount: 100, type: "CONTRIBUTION" }], 12);
    const hit = series.find((s) => s.amount === 100);
    expect(hit).toBeDefined();
    expect(hit.count).toBe(1);
  });

  it("periodComparison30d splits windows", () => {
    const day = 24 * 60 * 60 * 1000;
    const t1 = new Date(Date.now() - 5 * day).toISOString();
    const t2 = new Date(Date.now() - 40 * day).toISOString();
    const c = periodComparison30d([
      { date: t1, amount: 10, type: "X" },
      { date: t2, amount: 20, type: "X" }
    ]);
    expect(c.last30.count).toBe(1);
    expect(c.prev30.count).toBe(1);
  });
});
