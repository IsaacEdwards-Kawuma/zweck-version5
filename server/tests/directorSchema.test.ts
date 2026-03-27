import { describe, it, expect } from "vitest";
import { createDirectorSchema, updateDirectorSchema } from "../src/routes/directors.js";

describe("director profile schemas", () => {
  it("accepts extended profile fields on create", () => {
    const parsed = createDirectorSchema.parse({
      name: "Jane Doe",
      initials: "JD",
      email: "jane@example.com",
      phone: "+256700000000",
      idNumber: "CM123456789",
      occupation: "Operations Manager",
      address: "Kampala",
      nextOfKinName: "John Doe",
      nextOfKinPhone: "+256711111111",
      notes: "Trusted signatory",
      active: true
    });

    expect(parsed.phone).toBe("+256700000000");
    expect(parsed.idNumber).toBe("CM123456789");
    expect(parsed.nextOfKinName).toBe("John Doe");
  });

  it("allows partial update payloads for profile fields", () => {
    const parsed = updateDirectorSchema.parse({
      occupation: "Finance Lead",
      notes: "Updated profile"
    });
    expect(parsed.occupation).toBe("Finance Lead");
    expect(parsed.notes).toBe("Updated profile");
  });
});

