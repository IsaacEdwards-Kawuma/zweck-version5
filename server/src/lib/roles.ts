import type { Role } from "@prisma/client";

/** Platform administration (settings, users, ledger admin actions, etc.). */
export function hasAdminPrivileges(role: Role): boolean {
  return role === "ADMIN" || role === "ADMIN_DIRECTOR";
}

/** Director-level access (portfolio, board workflows, director self-service). */
export function hasDirectorPrivileges(_role: Role): boolean {
  // All authenticated roles (including USER) may use director-level read routes.
  void _role;
  return true;
}
