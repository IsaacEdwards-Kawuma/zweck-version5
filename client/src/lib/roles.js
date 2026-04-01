/** Platform administration (matches server `requireRole("ADMIN")`). */
export function hasAdminPrivileges(role) {
  return role === "ADMIN" || role === "ADMIN_DIRECTOR";
}

/** Director-level access (portfolio, board, director self-service). */
export function hasDirectorPrivileges(role) {
  return Boolean(role);
}

/**
 * Staff / leadership roles: main financial dashboard (`/dashboard`), same nav as admins,
 * and accounting routes behind `RequireStaff`. Excludes `USER` (member home at `/user`).
 * ADMIN, ADMIN_DIRECTOR, CEO, and DIRECTOR are included alongside treasury and operations.
 */
export function isStaffRole(role) {
  return (
    role === "ADMIN" ||
    role === "ADMIN_DIRECTOR" ||
    role === "CEO" ||
    role === "DIRECTOR" ||
    role === "TREASURER" ||
    // "Project manager" role in this codebase maps closest to OPERATIONAL_MANAGER.
    role === "OPERATIONAL_MANAGER"
  );
}

export function isUserRole(role) {
  return role === "USER";
}

/** Company secretary home at `/secretary` — governance, meetings, correspondence workflows. */
export function isSecretaryRole(role) {
  return role === "SECRETARY";
}

/** Treasurer home at `/treasurer` — cash, ledger, approvals, invoicing. */
export function isTreasurerRole(role) {
  return role === "TREASURER";
}

/** Financial reports (`/reports`): staff roles plus company secretary (read-only reporting). */
export function canAccessReports(role) {
  return isStaffRole(role) || isSecretaryRole(role);
}
