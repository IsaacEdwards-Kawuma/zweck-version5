import { describe, it, expect } from "vitest";
import type { Director } from "@prisma/client";
import {
  canViewDirectorConfidentialProfile,
  canViewDirectorContact,
  canViewDirectorFinancials,
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

  it("finance leadership can view confidential profile + contact + financials", () => {
    const viewer = { role: "TREASURER", directorId: null };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(true);
    expect(canViewDirectorContact(viewer, 7)).toBe(true);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(true);
  });

  it("other directors can see another director's confidential profile fields", () => {
    const viewer = { role: "DIRECTOR", directorId: 99 };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(true);
    expect(canViewDirectorContact(viewer, 7)).toBe(true);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(true);
  });

  it("USER role can view contact, confidential profile, and financials", () => {
    const viewer = { role: "USER", directorId: null };
    expect(canViewDirectorConfidentialProfile(viewer, 7)).toBe(true);
    expect(canViewDirectorContact(viewer, 7)).toBe(true);
    expect(canViewDirectorFinancials(viewer, 7)).toBe(true);
  });

  it("toDirectorPublic includes confidential fields for authenticated viewers including USER", () => {
    const d = mkDirector();
    const viewerDirector = { role: "DIRECTOR", directorId: 99 };
    const pubDirector = toDirectorPublic(d, viewerDirector);
    expect(pubDirector.email).toBe("jane@example.com");
    expect(pubDirector.idNumber).toBe("CM123456789");

    const viewerUser = { role: "USER", directorId: null };
    const pubUser = toDirectorPublic(d, viewerUser);
    expect(pubUser.email).toBe("jane@example.com");
    expect(pubUser.idNumber).toBe("CM123456789");
    expect(pubUser.notes).toBe("Confidential note");
  });
});

