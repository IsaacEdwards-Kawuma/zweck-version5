import { describe, it, expect } from "vitest";
import { utcYearMonth, utcIsFirstCalendarDay } from "../src/lib/monthlyStatementReminderJob.js";

describe("monthlyStatementReminderJob date helpers", () => {
  it("utcYearMonth returns YYYY-MM", () => {
    expect(utcYearMonth(new Date(Date.UTC(2026, 2, 1, 12, 0, 0)))).toBe("2026-03");
  });

  it("utcIsFirstCalendarDay is true only on UTC day 1", () => {
    expect(utcIsFirstCalendarDay(new Date(Date.UTC(2026, 2, 1, 0, 0, 0)))).toBe(true);
    expect(utcIsFirstCalendarDay(new Date(Date.UTC(2026, 2, 2, 0, 0, 0)))).toBe(false);
  });
});
