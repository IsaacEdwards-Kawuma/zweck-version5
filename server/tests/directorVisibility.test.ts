import { describe, it, expect } from "vitest";
import type { Director } from "@prisma/client";
import {
  canViewDirectorConfidentialProfile,
  canViewDirectorContact,
  canViewDirectorFinancials,
  powerTierForRole,
  toDirectorPublic
} from "../src/lib/directorVisibility.js";

function mkDirector(overrides: Partial<Director> = {}): Director {
  const base: Director = {
    id: 7,
    name: "Jane Doe",
    initials: "JD",
    email: "jane@example.com",
    phone: "+256700000000",
    idNumber: "CM123456789",
    occupation: "Finance",
    address: "Kampala",
    nextOfKinName: "John Doe",
    nextOfKinPhone: "+256711111111",
    notes: "Confidential note",
    avatarUrl: null,
    active: true,
    createdAt: new Date("2026-03-01T00:00:00.000Z")
  };
  return { ...base, ...overrides };
}

describe("directorVisibility", () => {
  it("assigns expected power tiers", () => {
    expect(powerTierForRole("ADMIN")).toBe(3);
    expect(powerTierForRole("ADMIN_DIRECTOR")).toBe(3);
    expect(powerTierForRole("TREASURER")).toBe(2);
    expect(powerTierForRole("CEO")).toBe(2);
    expect(powerTierForRole("OPERATIONAL_MANAGER")).toBe(2);
    expect(powerTierForRole("DIRECTOR")).toBe(1);
    expect(powerTierForRole("USER")).toBe(0);
  });

  it("admin roles can view confidential profile + financials", () => {
    const viewer = { role: "ADMIN", directorId: null };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(true);
    expect(canViewDirectorContact(viewer, 7)).toBe(true);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(true);
  });

  it("director self can view confidential profile + financials", () => {
    const viewer = { role: "DIRECTOR", directorId: 7 };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(true);
    expect(canViewDirectorContact(viewer, 7)).toBe(true);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(true);
  });

  it("finance leadership can view contact + financials but not confidential profile fields", () => {
    const viewer = { role: "TREASURER", directorId: null };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(false);
    expect(canViewDirectorContact(viewer, 7)).toBe(true);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(true);
  });

  it("other directors cannot see another director's confidential profile fields", () => {
    const viewer = { role: "DIRECTOR", directorId: 99 };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(false);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(false);
  });

  it("toDirectorPublic strips confidential fields when not allowed", () => {
    const d = mkDirector();
    const viewer = { role: "DIRECTOR", directorId: 99 };
    const pub = toDirectorPublic(d, viewer);

    expect(pub.id).toBe(7);
    expect(pub.name).toBe("Jane Doe");
    expect(pub.email).toBeUndefined();
    expect(pub.idNumber).toBeUndefined();
    expect(pub.nextOfKinName).toBeUndefined();
    expect(pub.notes).toBeUndefined();
  });
});

