/** Platform administration (matches server `requireRole("ADMIN")`). */
export function hasAdminPrivileges(role) {
  return role === "ADMIN" || role === "ADMIN_DIRECTOR";
}

/** Director-level access (portfolio, board, director self-service). */
export function hasDirectorPrivileges(role) {
  return Boolean(role);
}

/**
 * Staff roles allowed to access the current "staff dashboard" and accounting workflows.
 * Keep this explicit to avoid unintentionally granting new roles access.
 */
export function isStaffRole(role) {
  return (
    role === "ADMIN" ||
    role === "ADMIN_DIRECTOR" ||
    role === "TREASURER" ||
    // "Project manager" role in this codebase maps closest to OPERATIONAL_MANAGER.
    role === "OPERATIONAL_MANAGER"
  );
}

export function isUserRole(role) {
  return role === "USER";
}
