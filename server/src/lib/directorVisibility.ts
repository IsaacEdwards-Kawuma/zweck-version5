import type { Director, Role } from "@prisma/client";

export type Viewer = { role: Role; directorId: number | null };

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

export function canViewDirectorFinancials(viewer: Viewer, directorId: number): boolean {
  // Power tiers removed: all non-USER roles are treated the same.
  // Route guards should block USER before this runs, but keep safe.
  void directorId;
  return String(viewer.role) !== "USER";
}

export function canViewDirectorConfidentialProfile(viewer: Viewer, directorId: number): boolean {
  void directorId;
  return String(viewer.role) !== "USER";
}

export function canViewDirectorContact(viewer: Viewer, directorId: number): boolean {
  void directorId;
  return String(viewer.role) !== "USER";
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

