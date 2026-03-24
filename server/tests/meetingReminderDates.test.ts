import { describe, it, expect } from "vitest";
import { subtractDaysYmd } from "../src/lib/meetingReminderJob.js";

describe("subtractDaysYmd", () => {
  it("subtracts days within the same month", () => {
    expect(subtractDaysYmd("2025-03-15", 7)).toBe("2025-03-08");
  });

  it("handles month boundaries", () => {
    expect(subtractDaysYmd("2025-03-01", 1)).toBe("2025-02-28");
  });

  it("handles leap year February", () => {
    expect(subtractDaysYmd("2024-03-01", 1)).toBe("2024-02-29");
  });

  it("returns null for invalid input", () => {
    expect(subtractDaysYmd("not-a-date", 1)).toBeNull();
  });
});
