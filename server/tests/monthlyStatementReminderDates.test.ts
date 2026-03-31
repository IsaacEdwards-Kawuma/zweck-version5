import { describe, it, expect } from "vitest";
import {
  utcYearMonth,
  utcIsFirstCalendarDay,
  utcPreviousYearMonth,
  buildMonthlyStatementReportLink
} from "../src/lib/monthlyStatementReminderJob.js";

describe("monthlyStatementReminderJob date helpers", () => {
  it("utcYearMonth returns YYYY-MM", () => {
    expect(utcYearMonth(new Date(Date.UTC(2026, 2, 1, 12, 0, 0)))).toBe("2026-03");
  });

  it("utcIsFirstCalendarDay is true only on UTC day 1", () => {
    expect(utcIsFirstCalendarDay(new Date(Date.UTC(2026, 2, 1, 0, 0, 0)))).toBe(true);
    expect(utcIsFirstCalendarDay(new Date(Date.UTC(2026, 2, 2, 0, 0, 0)))).toBe(false);
  });

  it("utcPreviousYearMonth returns prior calendar month", () => {
    expect(utcPreviousYearMonth(new Date(Date.UTC(2026, 2, 1, 0, 0, 0)))).toBe("2026-02");
    expect(utcPreviousYearMonth(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe("2025-12");
  });

  it("buildMonthlyStatementReportLink matches Reports deep link for prior month", () => {
    const period = utcPreviousYearMonth(new Date(Date.UTC(2026, 2, 1, 0, 0, 0)));
    expect(period).toBe("2026-02");
    expect(buildMonthlyStatementReportLink(period)).toBe(
      "/reports?monthly=1&period=2026-02"
    );
    expect(buildMonthlyStatementReportLink("2025-12")).toBe(
      "/reports?monthly=1&period=2025-12"
    );
  });
});
