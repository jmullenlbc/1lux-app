-- Make releasedById nullable on WarehouseRelease.
-- PENDING releases have no approving ILC user yet; releasedById is set on APPROVED.

ALTER TABLE "WarehouseRelease" DROP CONSTRAINT IF EXISTS "WarehouseRelease_releasedById_fkey";
ALTER TABLE "WarehouseRelease" ALTER COLUMN "releasedById" DROP NOT NULL;
ALTER TABLE "WarehouseRelease" ADD CONSTRAINT "WarehouseRelease_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
