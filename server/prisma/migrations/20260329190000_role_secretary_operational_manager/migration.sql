-- AlterEnum: add secretary and operational manager roles (PostgreSQL)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SECRETARY';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPERATIONAL_MANAGER';
