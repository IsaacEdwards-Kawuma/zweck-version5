/** Platform administration (matches server `requireRole("ADMIN")`). */
export function hasAdminPrivileges(role) {
  return role === "ADMIN" || role === "ADMIN_DIRECTOR";
}

/** Director-level access (portfolio, board, director self-service). */
export function hasDirectorPrivileges(role) {
  return Boolean(role);
}
