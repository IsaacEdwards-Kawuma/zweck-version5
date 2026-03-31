import type { Director, Role } from "@prisma/client";

export type Viewer = { role: Role; directorId: number | null };

export type PowerTier = 0 | 1 | 2 | 3;

export type DirectorPublic = Pick<
  Director,
  "id" | "name" | "initials" | "avatarUrl" | "active" | "createdAt"
> & {
  // present only when viewer is allowed
  email?: string;
  phone?: string | null;
  idNumber?: string | null;
  occupation?: string | null;
  address?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  notes?: string | null;
};

/**
 * Power tiers (higher = more access):
 * - Tier 3: ADMIN, ADMIN_DIRECTOR (full access)
 * - Tier 2: TREASURER, CEO, OPERATIONAL_MANAGER (financial leadership)
 * - Tier 1: DIRECTOR (self-only)
 * - Tier 0: USER (no director access; routes should block before this)
 */
export function powerTierForRole(role: Role): PowerTier {
  // Some environments may have stale generated Prisma `Role` types during deploys.
  // Compare via string to keep runtime behavior correct while avoiding impossible-union TS errors.
  const r = String(role);
  if (r === "ADMIN" || r === "ADMIN_DIRECTOR") return 3;
  if (r === "TREASURER" || r === "CEO" || r === "OPERATIONAL_MANAGER") return 2;
  if (r === "DIRECTOR") return 1;
  return 0;
}

export function canViewDirectorFinancials(viewer: Viewer, directorId: number): boolean {
  const tier = powerTierForRole(viewer.role);
  if (tier >= 3) return true;
  if (tier >= 2) return true;
  return tier >= 1 && viewer.directorId != null && viewer.directorId === directorId;
}

export function canViewDirectorConfidentialProfile(viewer: Viewer, directorId: number): boolean {
  const tier = powerTierForRole(viewer.role);
  if (tier >= 3) return true;
  if (tier >= 2) return true;
  return tier >= 1 && viewer.directorId != null && viewer.directorId === directorId;
}

export function canViewDirectorContact(viewer: Viewer, directorId: number): boolean {
  if (canViewDirectorConfidentialProfile(viewer, directorId)) return true;
  return powerTierForRole(viewer.role) >= 1;
}

export function toDirectorPublic(d: Director, viewer: Viewer): DirectorPublic {
  const base: DirectorPublic = {
    id: d.id,
    name: d.name,
    initials: d.initials,
    avatarUrl: d.avatarUrl,
    active: d.active,
    createdAt: d.createdAt
  };

  if (canViewDirectorContact(viewer, d.id)) {
    base.email = d.email;
    base.phone = d.phone;
  }

  if (canViewDirectorConfidentialProfile(viewer, d.id)) {
    base.idNumber = d.idNumber;
    base.occupation = d.occupation;
    base.address = d.address;
    base.nextOfKinName = d.nextOfKinName;
    base.nextOfKinPhone = d.nextOfKinPhone;
    base.notes = d.notes;
  }

  return base;
}

