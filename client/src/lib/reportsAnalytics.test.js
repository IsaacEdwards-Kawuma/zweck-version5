import { describe, it, expect } from "vitest";
import {
  reportRangeLast30Days,
  reportRangeThisMonth,
  reportRangeYtd,
  reportRolling30DayKpis,
  reportPeriodKpis,
  aggregateReportByMonth,
  aggregateByTypeTotals,
  filterByDateRange,
  incomeExpenseMix
} from "./reportsAnalytics";

describe("reportsAnalytics ranges", () => {
  it("reportRangeLast30Days spans 30 inclusive days", () => {
    const fixed = new Date(2026, 2, 24, 12, 0, 0);
    const r = reportRangeLast30Days(fixed);
    expect(r.to).toBe("2026-03-24");
    expect(r.from).toBe("2026-02-23");
  });

  it("reportRangeThisMonth covers March boundaries", () => {
    const fixed = new Date(2026, 2, 15, 12, 0, 0);
    const r = reportRangeThisMonth(fixed);
    expect(r.from).toBe("2026-03-01");
    expect(r.to).toBe("2026-03-31");
  });

  it("reportRangeYtd starts Jan 1", () => {
    const fixed = new Date(2026, 5, 10, 12, 0, 0);
    const r = reportRangeYtd(fixed);
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-06-10");
  });
});

describe("reportRolling30DayKpis", () => {
  it("aggregates only rows in rolling window", () => {
    const fixed = new Date(2026, 2, 24, 12, 0, 0);
    const r = reportRangeLast30Days(fixed);
    const txs = [
      { date: `${r.from}T12:00:00`, type: "CONTRIBUTION", amount: 100 },
      { date: "2020-01-01T12:00:00", type: "CONTRIBUTION", amount: 999 }
    ];
    const kpis = reportRolling30DayKpis(txs, fixed);
    const expected = reportPeriodKpis([txs[0]]);
    expect(kpis.contributions).toBe(expected.contributions);
    expect(kpis.contributions).toBe(100);
  });
});

describe("filterByDateRange", () => {
  it("returns all rows when both bounds empty", () => {
    const txs = [{ date: "2026-01-01T12:00:00" }, { date: "2026-06-01T12:00:00" }];
    expect(filterByDateRange(txs, "", "")).toBe(txs);
    expect(filterByDateRange(txs, "   ", undefined)).toBe(txs);
  });

  it("includes boundary days", () => {
    const txs = [
      { date: "2026-03-01T08:00:00", id: 1 },
      { date: "2026-03-15T12:00:00", id: 2 },
      { date: "2026-03-31T22:00:00", id: 3 },
      { date: "2026-02-28T12:00:00", id: 4 },
      { date: "2026-04-01T12:00:00", id: 5 }
    ];
    const out = filterByDateRange(txs, "2026-03-01", "2026-03-31");
    expect(out.map((t) => t.id).sort()).toEqual([1, 2, 3]);
  });
});

describe("reportPeriodKpis", () => {
  it("net equals income minus expenses (contributions tracked separately)", () => {
    const txs = [
      { date: "2026-03-01T12:00:00", type: "MMF_RETURN", amount: 20 },
      { date: "2026-03-02T12:00:00", type: "TX_CHARGE", amount: 5 },
      { date: "2026-03-03T12:00:00", type: "CONTRIBUTION", amount: 1000 }
    ];
    const k = reportPeriodKpis(txs);
    expect(k.net).toBe(k.income - k.expenses);
    expect(k.contributions).toBe(1000);
  });
});

describe("aggregateByTypeTotals", () => {
  it("sums amounts per type and sorts by total desc", () => {
    const rows = aggregateByTypeTotals([
      { type: "TX_CHARGE", amount: 3 },
      { type: "CONTRIBUTION", amount: 10 },
      { type: "TX_CHARGE", amount: 1 }
    ]);
    expect(rows[0].type).toBe("CONTRIBUTION");
    expect(rows[0].total).toBe(10);
    const tx = rows.find((r) => r.type === "TX_CHARGE");
    expect(tx.total).toBe(4);
  });
});

describe("incomeExpenseMix", () => {
  it("pie slice totals match reportPeriodKpis income and expenses", () => {
    const txs = [
      { date: "2026-03-01T12:00:00", type: "MMF_RETURN", amount: 3 },
      { date: "2026-03-02T12:00:00", type: "PENALTY", amount: 7 },
      { date: "2026-03-03T12:00:00", type: "TX_CHARGE", amount: 2 },
      { date: "2026-03-04T12:00:00", type: "LEGAL", amount: 5 },
      { date: "2026-03-05T12:00:00", type: "CONTRIBUTION", amount: 100 }
    ];
    const kpis = reportPeriodKpis(txs);
    const mix = incomeExpenseMix(txs);
    const sumIncome = mix.incomeRows.reduce((s, r) => s + r.value, 0);
    const sumExp = mix.expenseRows.reduce((s, r) => s + r.value, 0);
    expect(sumIncome).toBe(kpis.income);
    expect(sumExp).toBe(kpis.expenses);
  });
});

describe("aggregateReportByMonth", () => {
  it("single-month row matches reportPeriodKpis totals", () => {
    const txs = [
      { date: "2026-03-05T12:00:00", type: "CONTRIBUTION", amount: 10 },
      { date: "2026-03-10T12:00:00", type: "MMF_RETURN", amount: 5 },
      { date: "2026-03-15T12:00:00", type: "TX_CHARGE", amount: 2 }
    ];
    const kpis = reportPeriodKpis(txs);
    const byMonth = aggregateReportByMonth(txs);
    expect(byMonth).toHaveLength(1);
    expect(byMonth[0].contributions).toBe(kpis.contributions);
    expect(byMonth[0].income).toBe(kpis.income);
    expect(byMonth[0].expenses).toBe(kpis.expenses);
  });
});
