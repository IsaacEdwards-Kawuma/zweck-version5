import type { Role } from "@prisma/client";

/** Platform administration (settings, users, ledger admin actions, etc.). */
export function hasAdminPrivileges(role: Role): boolean {
  return role === "ADMIN" || role === "ADMIN_DIRECTOR";
}

/** Director-level access (portfolio, board workflows, director self-service). */
export function hasDirectorPrivileges(role: Role): boolean {
  // All non-USER roles should be able to access dashboard/reports/director pages.
  // ADMIN is handled elsewhere too, but include it here for consistency.
  return role !== "USER";
}
