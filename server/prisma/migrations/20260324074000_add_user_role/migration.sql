-- Add USER role so non-bootstrap signups can be persisted as regular users.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'USER';
