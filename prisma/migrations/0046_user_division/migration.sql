-- Assign users to a company division. The Sales Owner dropdown filters to SALES.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "division" TEXT;
