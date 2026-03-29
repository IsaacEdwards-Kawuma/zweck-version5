-- AlterEnum: add CEO role (PostgreSQL)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CEO';
