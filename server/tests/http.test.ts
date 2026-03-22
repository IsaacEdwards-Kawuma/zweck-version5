import { describe, it, expect } from "vitest";
import { apiError } from "../src/lib/http.js";

describe("apiError", () => {
  it("returns error body", () => {
    expect(apiError("Bad")).toEqual({ error: true, message: "Bad" });
  });

  it("includes optional field", () => {
    expect(apiError("Invalid", "email")).toEqual({ error: true, message: "Invalid", field: "email" });
  });
});
