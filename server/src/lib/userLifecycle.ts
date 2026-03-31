import { prisma } from "./prisma.js";

export type UserLoginGate = {
  deletedAt: Date | null;
  isActive: boolean;
  adminBlockedAt: Date | null;
};

export function loginDeniedMessage(u: UserLoginGate): string | null {
  if (u.deletedAt) return "This account has been removed.";
  if (!u.isActive) return "This account is deactivated.";
  if (u.adminBlockedAt) return "This account has been blocked by an administrator.";
  return null;
}

/** Admins who can currently sign in (used to protect the last admin). */
export async function countAbleAdmins(): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      deletedAt: null,
      isActive: true,
      adminBlockedAt: null
    }
  });
}
