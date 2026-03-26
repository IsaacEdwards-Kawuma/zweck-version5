import { prisma } from "./prisma.js";

export async function getOrCreateAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {}
  });
}
