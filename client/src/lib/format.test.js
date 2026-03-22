import { describe, it, expect } from "vitest";
import { eur, eurCompact, pctFmt01 } from "./format";

describe("format", () => {
  it("eur includes currency", () => {
    expect(eur(10)).toMatch(/10/);
  });

  it("pctFmt01 formats fraction", () => {
    expect(pctFmt01(0.5, 0)).toBe("50%");
  });

  it("eurCompact uses k for thousands", () => {
    expect(eurCompact(1500)).toMatch(/1\.5k/);
  });
});
