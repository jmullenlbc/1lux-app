-- 0013_ship_schedule_v2

-- Add destinationType to Shipment
ALTER TABLE "Shipment" ADD COLUMN "destinationType" TEXT NOT NULL DEFAULT 'WAREHOUSE';

-- Extend WarehouseRelease with approval workflow fields
ALTER TABLE "WarehouseRelease" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "WarehouseRelease" ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WarehouseRelease" ADD COLUMN "requestedByPortalUserId" TEXT;
ALTER TABLE "WarehouseRelease" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "WarehouseRelease" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "WarehouseRelease" ADD COLUMN "qtyReleased" INTEGER;

-- FKs for new WarehouseRelease fields
ALTER TABLE "WarehouseRelease"
  ADD CONSTRAINT "WarehouseRelease_requestedByPortalUserId_fkey"
  FOREIGN KEY ("requestedByPortalUserId") REFERENCES "PortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WarehouseRelease"
  ADD CONSTRAINT "WarehouseRelease_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ManufacturerDeliveryEvent
CREATE TABLE "ManufacturerDeliveryEvent" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "qtyReceived" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturerDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManufacturerDeliveryEvent_lineItemId_idx" ON "ManufacturerDeliveryEvent"("lineItemId");

ALTER TABLE "ManufacturerDeliveryEvent"
  ADD CONSTRAINT "ManufacturerDeliveryEvent_lineItemId_fkey"
  FOREIGN KEY ("lineItemId") REFERENCES "ShipmentLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManufacturerDeliveryEvent"
  ADD CONSTRAINT "ManufacturerDeliveryEvent_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
