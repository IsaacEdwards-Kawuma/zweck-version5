/** Resolve stored avatar path for use in img src (same-origin /api/uploads/... in app). */
export function resolveAvatarUrl(avatarUrl) {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  if (avatarUrl.startsWith("/")) return avatarUrl;
  return `/${String(avatarUrl).replace(/^\/+/, "")}`;
}
