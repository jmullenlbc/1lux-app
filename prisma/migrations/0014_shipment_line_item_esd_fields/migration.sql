-- Add per-item ESD, lead time, and tracking fields to ShipmentLineItem
-- These override shipment-level values when set; UI falls back to shipment-level if null.

ALTER TABLE "ShipmentLineItem" ADD COLUMN "leadTimeWeeks" TEXT;
ALTER TABLE "ShipmentLineItem" ADD COLUMN "esdDate" TIMESTAMP(3);
ALTER TABLE "ShipmentLineItem" ADD COLUMN "trackingNumber" TEXT;
